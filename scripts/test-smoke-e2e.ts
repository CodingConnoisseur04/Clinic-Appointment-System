/*
 * End-to-end smoke test: patient booking -> receptionist confirmation.
 *
 * Drives the REAL app in a real Chromium browser:
 *   1. Patient signs up through /signup (handle_new_user trigger creates the
 *      profile with role=patient).
 *   2. Patient books through /patient/book using the on-page slot picker
 *      (/api/available-slots -> real availability from the seeded weekday hours).
 *   3. Receptionist (seeded-staff-convention account, created here via the
 *      admin API since the DB was rebuilt) signs in through /login, sees the
 *      request on /receptionist/pending, confirms it with a logged payment.
 *   4. The confirm flow POSTs /api/sms/send-confirmation -> with
 *      SEMAPHORE_DRY_RUN=true the send is synthetic but the sms_logs row is
 *      real, so the full write path is exercised.
 *
 * DB assertions use the service-role client (assertions only, never writes on
 * behalf of a user). Identity rules follow scripts/test-support.ts: every
 * account ends in @test.local so `resetTestState` sweeps it later.
 *
 * Run: npx tsx scripts/test-smoke-e2e.ts   (dev server must be running)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  let file: string;
  try {
    file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    if (!(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:3000";

if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE);

const PW = "test-password-123";
const PATIENT_EMAIL = "e2e-patient@test.local";
const RECEPTIONIST_EMAIL = "receptionist@clinic.local";
const PATIENT_NAME = "E2E Smoke Patient";
const PATIENT_PHONE_RAW = "+639179997001"; // canonicalizes to 09179997001
const PATIENT_PHONE_CANON = "09179997001";

let failures = 0;
function report(step: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] ${step}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Dev-mode hydration race guard: Next dev compiles pages on first hit, so the
 * page can be visible (SSR HTML) before React has attached handlers. Filling
 * too early sets DOM values React never saw. Give each interaction page a
 * settle beat and retry the whole fill+submit a few times; if an inline
 * validation alert shows up, the retry is pointless and we surface it.
 */
async function fillSubmitRetry(opts: {
  page: import("playwright").Page;
  fill: () => Promise<void>;
  submit: () => Promise<void>;
  success: () => Promise<boolean>;
  attempts?: number;
  label: string;
}) {
  const attempts = opts.attempts ?? 3;
  let lastAlert = "";
  for (let i = 1; i <= attempts; i++) {
    await opts.page.waitForLoadState("networkidle").catch(() => {});
    await opts.page.waitForTimeout(1200);
    await opts.fill();
    await opts.submit();
    // Full-window wait: a dev-compile navigation can take several seconds.
    const won = await opts.success();
    if (won) return;
    lastAlert = (await opts.page
      .locator("[role=alert]")
      .first()
      .textContent()
      .catch(() => "")) ?? "";
    if (lastAlert) break; // real validation error — retrying won't help
    console.log(`  [retry] ${opts.label}: attempt ${i} had no effect, retrying`);
  }
  throw new Error(
    `${opts.label} did not succeed after ${attempts} attempts${lastAlert ? ` — page says: "${lastAlert}"` : ""}`
  );
}

async function findReceptionist(admin: SupabaseClient): Promise<string | null> {
  // Paginate — local user list is small but do not assume.
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = (data?.users ?? []).find((u) => u.email === RECEPTIONIST_EMAIL);
    if (hit) return hit.id;
    if ((data?.users.length ?? 0) < 1000) break;
  }
  return null;
}

async function cleanup(admin: SupabaseClient) {
  // Remove this suite's own leftovers so it is rerunnable. Strictly scoped to
  // the @test.local patient this script creates (plus the curl probe user).
  const sweep = [PATIENT_EMAIL, "direct-probe@test.local"];
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users.data?.users ?? []) {
    if (sweep.includes(u.email ?? "")) {
      const { data: pats } = await admin
        .from("patients")
        .select("id")
        .eq("profile_id", u.id);
      const ids = (pats ?? []).map((p: { id: string }) => p.id);
      if (ids.length) {
        await admin.from("appointments").delete().in("patient_id", ids);
        await admin.from("patients").delete().in("id", ids);
      }
      await admin.auth.admin.deleteUser(u.id);
    }
  }
}

async function main() {
  await cleanup(admin);

  // ---- 0. Receptionist account exists (DB was rebuilt; recreate staff) ----
  let recId = await findReceptionist(admin);
  if (!recId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: RECEPTIONIST_EMAIL,
      password: PW,
      email_confirm: true,
      user_metadata: { full_name: "Front Desk", role: "receptionist" },
    });
    if (error || !data.user) {
      throw new Error(`could not create receptionist: ${error?.message}`);
    }
    recId = data.user.id;
  }
  // The handle_new_user trigger defaults role to 'patient'; staff role is set
  // on the profile directly (same convention seed scripts use).
  await admin.from("profiles").update({ role: "receptionist" }).eq("id", recId);
  const { data: recProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", recId)
    .single();
  report(
    "Receptionist staff account ready",
    recProfile?.role === "receptionist",
    `role=${recProfile?.role ?? "?"}`
  );

  // ---- 1. Patient signs up through the real /signup page ------------------
  const browser = await chromium.launch();
  const patientCtx = await browser.newContext();
  const patient = await patientCtx.newPage();
  const errors: string[] = [];
  patient.on("pageerror", (e) => errors.push(String(e)));

  await patient.goto(`${APP}/signup`);
  patient.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      console.log(`  [console.${m.type()}] ${m.text().slice(0, 300)}`);
    }
  });
  patient.on("requestfailed", (r) => {
    if (r.url().includes("54321")) {
      console.log(`  [reqfailed] ${r.url()} — ${r.failure()?.errorText}`);
    }
  });
  patient.on("response", (r) => {
    if (r.status() >= 400) {
      console.log(`  [http ${r.status()}] ${r.url()}`);
    }
  });
  try {
    await fillSubmitRetry({
      page: patient,
      label: "patient signup",
      fill: async () => {
        await patient.getByLabel("Full name").fill(PATIENT_NAME);
        await patient.getByLabel("Mobile number").fill(PATIENT_PHONE_RAW);
        await patient.getByLabel("Email").fill(PATIENT_EMAIL);
        await patient.getByLabel("Password").fill(PW);
      },
      submit: () => patient.getByRole("button", { name: "Create account" }).click(),
      success: () =>
        patient
          .waitForURL(`${APP}/patient`, { timeout: 8000 })
          .then(() => true)
          .catch(() => false),
    });
  } catch (e) {
    await patient.screenshot({ path: "smoke-signup-fail.png", fullPage: true });
    const diag = await patient.evaluate(() => ({
      hasForm: !!document.querySelector("form"),
      buttonDisabled: (document.querySelector("button[type=submit]") as HTMLButtonElement | null)?.disabled ?? null,
      nameValue: (document.getElementById("fullName") as HTMLInputElement | null)?.value ?? null,
      emailValue: (document.getElementById("email") as HTMLInputElement | null)?.value ?? null,
      sbUrlInBundle: document.documentElement.innerHTML.includes("54321"),
    }));
    console.error("signup step failed:", e);
    console.error("diag:", diag);
    console.error("page errors:", errors);
    throw e;
  }
  report(
    "Patient signup lands on /patient",
    patient.url().includes("/patient"),
    `url=${patient.url()}`
  );

  // ---- 2. Patient books through /patient/book ------------------------------
  await patient.goto(`${APP}/patient/book`);
  console.log(`  [diag] after goto book: url=${patient.url()}`);
  try {
    await patient.getByLabel("Full name").waitFor({ state: "visible", timeout: 10000 });
    // Profile arrives via a client-side fetch after mount — poll, don't read once.
    await patient
      .waitForFunction(
        (expected) => (document.getElementById("pt-name") as HTMLInputElement | null)?.value === expected,
        PATIENT_NAME,
        { timeout: 8000 }
      )
      .catch(() => {});
  } catch {
    await patient.screenshot({ path: "smoke-book-fail.png", fullPage: true });
    const body = await patient.locator("body").innerText();
    const cookies = await patientCtx.cookies();
    console.error("book step failed. url:", patient.url());
    console.error("cookies:", cookies.map((c) => c.name).join(", "));
    console.error("page errors:", errors);
    console.error("visible text:", body.slice(0, 800));
    throw new Error("booking form never appeared (see smoke-book-fail.png)");
  }
  // Profile fields are prefilled from the profile row — keep them.
  const nameVal = await patient.getByLabel("Full name").inputValue();
  report("Booking form prefilled from profile", nameVal === PATIENT_NAME, `name="${nameVal}"`);

  // Pick the first future MONDAY-FRIDAY on the calendar. Today's remaining
  // slots are all in the past (booking happens after clinic hours) and the
  // slot picker filters past times, so today must be excluded. Weekday math
  // inside the page beats locator arithmetic: grid edges contain trailing
  // days from adjacent months, and "first enabled button" can land on them.
  const pickedDay = await patient.waitForFunction(
    () => {
      const btns = [
        ...document.querySelectorAll("table button[data-day]:not([disabled])"),
      ];
      const target = btns.find((b) => {
        const d = new Date(b.getAttribute("data-day") || "");
        const dow = d.getDay();
        return !isNaN(d.getTime()) && d.getTime() > Date.now() && dow >= 1 && dow <= 5;
      });
      if (target) {
        (target as HTMLElement).click();
        return (target as HTMLElement).getAttribute("data-day");
      }
      return null;
    },
    { timeout: 10000 }
  );
  console.log(`  [diag] picked day: ${pickedDay}`);

  // Slot picker fetches /api/available-slots; wait for a slot button.
  const openTimes = patient.getByRole("group", { name: "Open times" });
  await openTimes.waitFor({ state: "visible", timeout: 15000 });
  const slotButtons = openTimes.getByRole("button");
  const slotCount = await slotButtons.count();
  report("Slot picker shows open times", slotCount > 0, `slots=${slotCount}`);
  if (slotCount === 0) throw new Error("no open slots — availability seed missing?");

  const chosenLabel = (await slotButtons.first().textContent())?.trim() ?? "";
  await slotButtons.first().click();

  await patient.getByRole("button", { name: "Send request" }).click();
  await patient.getByText("We have your request").waitFor({ timeout: 15000 });
  report("Booking receipt shown", true, `slot picked: ${chosenLabel}`);

  // ---- 3. DB: appointment is PENDING, source=online, patient row linked ----
  const { data: patientRow } = await admin
    .from("patients")
    .select("id, phone, profile_id")
    .eq("phone", PATIENT_PHONE_CANON)
    .maybeSingle();
  report(
    "patients row created, phone canonicalized, profile linked",
    !!patientRow &&
      patientRow.phone === PATIENT_PHONE_CANON &&
      patientRow.profile_id !== null,
    patientRow ? `phone=${patientRow.phone}, linked=${patientRow.profile_id !== null}` : "no row"
  );

  const { data: appts } = await admin
    .from("appointments")
    .select("id, status, source, payment_method, payment_reference")
    .eq("patient_id", patientRow!.id);
  const appt = (appts ?? [])[0];
  report(
    "Appointment exists with status=PENDING, source=online",
    !!appt && appt.status === "PENDING" && appt.source === "online",
    appt ? `status=${appt.status}, source=${appt.source}` : "no appointment"
  );
  if (!appt) throw new Error("no appointment row — cannot continue");

  // ---- 4. Receptionist signs in and confirms -------------------------------
  const recCtx = await browser.newContext();
  const rec = await recCtx.newPage();
  rec.on("pageerror", (e) => errors.push(String(e)));

  await rec.goto(`${APP}/login`);
  await fillSubmitRetry({
    page: rec,
    label: "receptionist login",
    fill: async () => {
      await rec.getByLabel("Email").fill(RECEPTIONIST_EMAIL);
      await rec.getByLabel("Password").fill(PW);
    },
    submit: () => rec.getByRole("button", { name: "Sign in" }).click(),
    success: () =>
      rec
        .waitForURL(`${APP}/receptionist**`, { timeout: 8000 })
        .then(() => true)
        .catch(() => false),
  });
  report("Receptionist login lands on /receptionist", rec.url().includes("/receptionist"));

  await rec.goto(`${APP}/receptionist/pending`);
  await rec
    .getByText(PATIENT_NAME, { exact: false })
    .first()
    .waitFor({ timeout: 15000 });
  report("Pending request visible to receptionist", true);

  await rec.getByRole("button", { name: "Confirm & log payment" }).click();
  await rec.getByText("Log payment and confirm").waitFor({ timeout: 5000 });
  // The dialog's method Label has no htmlFor association (a11y gap — noted in
  // changelog), so address the trigger by role rather than label. Cash is the
  // preselected default; exercise the dropdown and pick it explicitly.
  const methodTrigger = rec.getByRole("dialog").getByRole("combobox").first();
  if (await methodTrigger.isVisible().catch(() => false)) {
    await methodTrigger.click();
    await rec.getByRole("option", { name: "Cash" }).click().catch(() => {});
  }
  await rec.getByLabel("Payment reference").fill("SMOKE-RCPT-001");
  await rec
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();

  // The confirm dialog closes, then the SMS outcome banner appears.
  await rec.getByText(/Confirmation SMS delivered|confirmation SMS failed/).waitFor({
    timeout: 20000,
  });
  const bannerText = await rec
    .getByText(/Confirmation SMS delivered|confirmation SMS failed/)
    .textContent();
  report(
    "SMS outcome banner shown after confirm",
    !!bannerText,
    bannerText?.slice(0, 80) ?? ""
  );

  // ---- 5. DB: CONFIRMED + payment logged + exactly one sms_logs row --------
  const { data: after } = await admin
    .from("appointments")
    .select("status, payment_method, payment_reference")
    .eq("id", appt.id)
    .single();
  report(
    "Appointment CONFIRMED with payment logged",
    after?.status === "CONFIRMED" &&
      after?.payment_method === "cash" &&
      after?.payment_reference === "SMOKE-RCPT-001",
    after
      ? `status=${after.status}, method=${after.payment_method}, ref=${after.payment_reference}`
      : "row gone"
  );

  const { data: logs, error: logsErr } = await admin
    .from("sms_logs")
    .select("type, status, provider_response")
    .eq("appointment_id", appt.id);
  report(
    "sms_logs: exactly one confirmation row, status=sent",
    !logsErr && (logs ?? []).length === 1 && logs![0].status === "sent" && logs![0].type === "confirmation",
    (logs ?? []).map((l) => `${l.type}/${l.status}/${l.provider_response}`).join("; ") || "none"
  );

  // ---- 6. Hygiene: no page errors on either side ---------------------------
  report("No uncaught page errors during the run", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(
    failures === 0
      ? "\nSmoke test: ALL CHECKS PASSED"
      : `\nSmoke test: ${failures} check(s) FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
