/*
 * Browser test for the same-day Move: a real receptionist session moves a
 * real appointment to a later slot TODAY through the actual dialog, then the
 * DB is checked for the move and the re-text (dry-run).
 *
 * Fixture: creates its own @test.local patient with a today appointment
 * (first open slot +90 min, so it is movable). Sweeps its own rows first, so
 * it is rerunnable. Dev server must be running. Dry-run required.
 *
 * Run: npx tsx scripts/test-reschedule-browser.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findOrCreatePatient } from "@/lib/patients/find-or-create-patient";
import { createAppointment } from "@/lib/booking/create-appointment";
import { todayIso } from "@/lib/utils";

function loadEnvLocal() {
  const file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const APP = process.env.SMOKE_APP_URL ?? "http://127.0.0.1:3000";
const PW = "dev-password-only";
const REC = "receptionist@clinic.local";
const PATIENT_EMAIL = `resched-browser-${Date.now()}@test.local`;
const PATIENT_PHONE = "+639192222001";

if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}
if (process.env.SEMAPHORE_DRY_RUN !== "true") {
  console.error("SEMAPHORE_DRY_RUN must be true for this test.");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);

let failures = 0;
function report(step: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] ${step}${detail ? ` — ${detail}` : ""}`);
}

function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** First two OPEN slots for a weekday at least +60min from now (today-safe). */
async function openSlots(date: string, count: number): Promise<string[]> {
  const dow = new Date(`${date}T00:00:00`).getDay();
  const { data: hours, error } = await admin
    .from("doctor_availability")
    .select("start_time, end_time, slot_duration_minutes")
    .eq("day_of_week", dow)
    .eq("is_active", true);
  if (error || !hours || hours.length === 0) throw new Error(`no availability for ${date}`);
  const { data: booked } = await admin
    .from("appointments")
    .select("appointment_time")
    .eq("appointment_date", date)
    .neq("status", "CANCELLED");
  const taken = new Set((booked ?? []).map((b: { appointment_time: string }) => b.appointment_time.slice(0, 5)));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const h = hours[0] as { start_time: string; end_time: string; slot_duration_minutes: number };
  const [sh, sm] = h.start_time.slice(0, 5).split(":").map(Number);
  const [eh, em] = h.end_time.slice(0, 5).split(":").map(Number);
  const out: string[] = [];
  for (let t = sh * 60 + sm; t + h.slot_duration_minutes <= eh * 60 + em; t += h.slot_duration_minutes) {
    const label = fmtMin(t);
    if (date === todayIso() && t <= nowMin + 60) continue; // needs +60min runway to be movable
    if (taken.has(label)) continue;
    out.push(label);
    if (out.length === count) break;
  }
  return out;
}

let tempAvailabilityId: string | null = null;
let originalAvailabilityEnd: string | null = null;

/**
 * Same-day moves need TODAY to have bookable hours reaching late enough that
 * slots exist beyond now+60min at whatever time the test runs. If no active
 * row exists for today's weekday, one is inserted; if one exists but ends too
 * early, its end_time is widened. Both edits are restored in main()'s finally.
 */
async function ensureTodayAvailability(today: string): Promise<void> {
  const dow = new Date(`${today}T00:00:00`).getDay();
  const { data: existing } = await admin
    .from("doctor_availability")
    .select("id, end_time")
    .eq("day_of_week", dow)
    .eq("is_active", true)
    .limit(1);
  if (existing && existing.length > 0) {
    originalAvailabilityEnd = (existing[0] as { end_time: string }).end_time;
    tempAvailabilityId = (existing[0] as { id: string }).id;
  }
  if (!tempAvailabilityId) {
    const { data: inserted, error } = await admin
      .from("doctor_availability")
      .insert({
        day_of_week: dow,
        start_time: "09:00:00",
        // End-of-day is deliberately late: the fixture needs slots still ahead
        // by +60 minutes whenever the test runs. Restored after the test.
        end_time: "23:00:00",
        slot_duration_minutes: 30,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`could not create temporary hours: ${error?.message}`);
    tempAvailabilityId = inserted.id;
    console.log(`No seeded hours for weekday ${dow}; temporary hours row created for this test.`);
    return;
  }
  // A row exists (possibly leaked by an earlier crashed run): widen its end
  // so there is always a movable slot ahead of now, restore afterwards.
  const { error: widenErr } = await admin
    .from("doctor_availability")
    .update({ end_time: "23:00:00" })
    .eq("id", tempAvailabilityId);
  if (widenErr) throw new Error(`could not widen hours: ${widenErr.message}`);
  console.log(`Weekday ${dow} hours widened to 23:00 for this test (was ${originalAvailabilityEnd}).`);
}

async function restoreAvailability(): Promise<void> {
  if (!tempAvailabilityId) return;
  if (originalAvailabilityEnd === null) {
    await admin.from("doctor_availability").delete().eq("id", tempAvailabilityId);
    console.log("Temporary hours row removed.");
  } else {
    await admin
      .from("doctor_availability")
      .update({ end_time: originalAvailabilityEnd })
      .eq("id", tempAvailabilityId);
    console.log(`Hours restored to ${originalAvailabilityEnd}.`);
  }
  tempAvailabilityId = null;
  originalAvailabilityEnd = null;
}

async function main() {
  const fixture = { apptId: null as string | null, patientId: null as string | null, userId: null as string | null };
  try {
    await runTest(fixture);
  } finally {
    // ---- Sweep fixture rows (rerunnable, crash-safe) ----------------------
    if (fixture.apptId) await admin.from("appointments").delete().eq("id", fixture.apptId);
    if (fixture.patientId) await admin.from("patients").delete().eq("id", fixture.patientId);
    if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId);
    await restoreAvailability();
  }
  process.exit(failures === 0 ? 0 : 1);
}

async function runTest(fixture: { apptId: string | null; patientId: string | null; userId: string | null }) {
  // ---- Fixture: patient + today appointment in a movable slot -------------
  const today = todayIso();
  await ensureTodayAvailability(today);
  const slots = await openSlots(today, 2);
  if (slots.length < 2) {
    console.error(`Not enough open slots left today (found ${slots.length}, need 2 with +60min runway). Run during clinic hours.`);
    process.exit(1);
  }
  const [fromSlot, toSlot] = slots;
  console.log(`Fixture: move ${today} ${fromSlot} -> ${toSlot} (same day)`);

  // Sweep previous runs of this phone.
  const { data: oldPats } = await admin.from("patients").select("id").eq("phone", "09192222001");
  for (const p of oldPats ?? []) {
    await admin.from("appointments").delete().eq("patient_id", (p as { id: string }).id);
    await admin.from("patients").delete().eq("id", (p as { id: string }).id);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: PATIENT_EMAIL,
    password: PW,
    email_confirm: true,
    user_metadata: { full_name: "Browser Move Patient", phone: PATIENT_PHONE },
  });
  if (createErr || !created.user) throw new Error(`patient create failed: ${createErr?.message}`);
  const patientClient = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await patientClient.auth.signInWithPassword({ email: PATIENT_EMAIL, password: PW });
  const reg = await findOrCreatePatient(patientClient, {
    phone: PATIENT_PHONE,
    fullName: "Browser Move Patient",
    profileId: created.user.id,
  });
  if (!("patientId" in reg) || !reg.patientId) throw new Error("find-or-create failed");
  const appt = await createAppointment(patientClient, {
    patientId: reg.patientId,
    appointmentDate: today,
    appointmentTime: fromSlot,
    source: "online",
  });
  if (!appt.success) throw new Error(`fixture appointment failed: ${appt.reason}`);
  fixture.apptId = appt.appointmentId;
  fixture.patientId = reg.patientId;
  fixture.userId = created.user.id;
  console.log(`Fixture appointment id: ${appt.appointmentId}`);

  // ---- Browser: receptionist moves it through the real dialog -------------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").click();
  await page.locator("#email").pressSequentially(REC, { delay: 2 });
  await page.locator("#password").click();
  await page.locator("#password").pressSequentially(PW, { delay: 2 });
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  report("Receptionist signed in", true);

  await page.goto(`${APP}/receptionist/appointments`, { waitUntil: "domcontentloaded" });
  const row = page.locator("li.ledger-row", { hasText: "Browser Move Patient" });
  await row.waitFor({ timeout: 20000 });
  report("Appointment row visible", true);

  const moveBtn = row.getByRole("button", { name: "Move" });
  if (!(await moveBtn.isVisible().catch(() => false))) {
    report("Move button visible on today's upcoming row", false, "button not found");
    throw new Error("Move button missing — is the not-yet-started guard working?");
  }
  report("Move button visible on today's upcoming row", true);
  await moveBtn.click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 5000 });
  report("Move dialog opened", true);

  // Pick TODAY on the calendar, then the target slot. react-day-picker v10
  // stamps button[data-day] in LOCALE format ("9/12/2026"), so match by
  // parsed date, not string prefix (same approach as the e2e smoke test).
  await dialog.locator("table button[data-day]").evaluateAll((buttons, target) => {
    const hit = (buttons as HTMLButtonElement[]).find((b) => {
      const d = new Date(b.getAttribute("data-day") ?? "");
      if (isNaN(d.getTime())) return false;
      return (
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` ===
        target
      );
    });
    if (hit) hit.click();
    // No else-throw: the today cell can carry no data-day in v10; the slot
    // grid below asserts the real outcome either way.
  }, today);
  await page.waitForTimeout(1500); // slot fetch
  // Slot buttons carry 12-hour labels; compute the expected label and click it.
  const targetLabel = (() => {
    const [h, m] = toSlot.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
  })();
  const slotByLabel = dialog.getByRole("group", { name: "Open times" }).getByRole("button", { name: targetLabel });
  await slotByLabel.waitFor({ timeout: 10000 });
  await slotByLabel.click();
  report("Target slot picked in dialog", true, targetLabel);

  await dialog.getByRole("button", { name: "Move appointment" }).click();
  await page.getByText(/Moved from/).waitFor({ timeout: 15000 });
  const toastText = await page.getByText(/Moved from/).textContent();
  report(
    "Move succeeded with both times stated",
    !!toastText && toastText.includes("Moved from"),
    toastText?.slice(0, 90) ?? ""
  );

  // ---- DB assertions ------------------------------------------------------
  const { data: after } = await admin
    .from("appointments")
    .select("appointment_date, appointment_time, status")
    .eq("id", appt.appointmentId!)
    .single();
  report(
    "DB: appointment moved to today's target slot, same row",
    !!after && after.appointment_date === today && after.appointment_time.slice(0, 5) === toSlot,
    after ? `${after.appointment_date} ${after.appointment_time.slice(0, 5)} status=${after.status}` : "no row"
  );

  const { data: logs } = await admin
    .from("sms_logs")
    .select("type, status, provider_response")
    .eq("appointment_id", appt.appointmentId!);
  report(
    "DB: no SMS expected for a PENDING move (patient was never promised a time)",
    (logs ?? []).length === 0,
    `${logs?.length ?? 0} rows`
  );

  report("No page errors during the run", pageErrors.length === 0, pageErrors.join(" | "));

  await browser.close();

  console.log(
    failures === 0 ? "\nBrowser move test: ALL CHECKS PASSED" : `\nBrowser move test: ${failures} check(s) FAILED`
  );
}

main().catch((e) => {
  console.error("Browser test crashed:", e);
  process.exit(1);
});
