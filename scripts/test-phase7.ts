import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/sms/send-sms";
import { sendConfirmationSms } from "@/lib/sms/send-confirmation";
import { createAppointment } from "@/lib/booking/create-appointment";

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
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

if (!URL.includes("127.0.0.1")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}
if (process.env.SEMAPHORE_DRY_RUN !== "true") {
  console.error(
    "SEMAPHORE_DRY_RUN must be 'true' to run this harness — it must never spend real credits."
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE);

let failures = 0;
function report(n: number, name: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] Test ${n}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function anonClient(): SupabaseClient {
  return createClient(URL, ANON);
}

async function signIn(client: SupabaseClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
}

async function signUpPatient(email: string, password: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: "P7 Patient", phone: "+639197777001" } },
  });
  if (error || !data.session || !data.user) {
    throw new Error(`signup failed: ${error?.message}`);
  }
  return { client, uid: data.user.id };
}

// A fetchImpl spy that fails the test loudly if any HTTP call is attempted.
function forbiddenFetch(calls: string[]): typeof fetch {
  return ((input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error(`NETWORK CALL ATTEMPTED: ${String(input)}`);
  }) as typeof fetch;
}

async function insertConfirmedAppt(
  patientId: string,
  date: string,
  time: string
): Promise<string> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_id: patientId,
      appointment_date: date,
      appointment_time: time,
      source: "walk_in",
      status: "CONFIRMED",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed appt failed: ${error?.message}`);
  return data.id;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function main() {
  // ---- Test 1: dry-run sendSms succeeds with NO network call ---------------
  const netCalls: string[] = [];
  const t1 = await sendSms(
    { number: "+639170000001", message: "dry-run probe" },
    forbiddenFetch(netCalls)
  );
  report(
    1,
    "sendSms dry-run: success without network call",
    t1.success && t1.messageId.startsWith("dry-run-") && netCalls.length === 0,
    `networkCalls=${netCalls.length}`
  );

  // ---- Setup for tests 2-4 --------------------------------------------------
  const rec = anonClient();
  await signIn(rec, "receptionist@clinic.local", "dev-password-only");
  const doctor = anonClient();
  await signIn(doctor, "doctor@clinic.local", "dev-password-only");
  const pA = await signUpPatient("p7-a@test.local", "test-password-123");

  const { data: patRow, error: patErr } = await admin
    .from("patients")
    .insert({ profile_id: pA.uid, full_name: "P7 Patient", phone: "+639197777001" })
    .select()
    .single();
  if (patErr || !patRow) throw new Error(`patients row failed: ${patErr?.message}`);

  // ---- Test 2: sendConfirmationSms writes a correctly-typed log row --------
  const appt1 = await insertConfirmedAppt(patRow.id, dateOffset(3), "10:00");
  const c2 = await sendConfirmationSms(rec, appt1);
  const { data: log2 } = await admin
    .from("sms_logs")
    .select("*")
    .eq("appointment_id", appt1)
    .single();
  report(
    2,
    "sendConfirmationSms logs confirmation via receptionist session",
    c2.logged && c2.delivered && log2?.type === "confirmation" && log2?.status === "sent" && !!log2?.sent_at,
    log2 ? `type=${log2.type}, status=${log2.status}` : "no row"
  );

  // ---- Test 3: sms_logs insert denied for patient/doctor sessions ----------
  const patIns = await pA.client.from("sms_logs").insert({
    appointment_id: appt1,
    type: "reminder",
    status: "sent",
  });
  const docIns = await doctor.from("sms_logs").insert({
    appointment_id: appt1,
    type: "reminder",
    status: "sent",
  });
  report(3, "sms_logs insert denied for patient and doctor sessions", !!patIns.error && !!docIns.error);

  // ---- Test 4: failure path writes 'failed' row, never throws --------------
  const appt2 = await insertConfirmedAppt(patRow.id, dateOffset(3), "11:00");
  let threw = false;
  let c4!: Awaited<ReturnType<typeof sendConfirmationSms>>;
  try {
    c4 = await sendConfirmationSms(rec, appt2, { simulateFailure: true });
  } catch {
    threw = true;
  }
  const { data: log4 } = await admin
    .from("sms_logs")
    .select("status, type")
    .eq("appointment_id", appt2)
    .single();
  report(
    4,
    "Failure path: 'failed' row logged, no exception",
    !threw && !c4.delivered && log4?.status === "failed" && log4?.type === "confirmation",
    log4 ? `status=${log4.status}` : "no row"
  );

  // ---- Tests 5 & 6: cron route auth + window precision ---------------------
  // Seed: one CONFIRMED ~24h out (inside window), one 72h out (outside).
  const insideAppt = await insertConfirmedAppt(patRow.id, dateOffset(1), "09:00");
  await insertConfirmedAppt(patRow.id, dateOffset(3), "13:00");

  const base = "http://127.0.0.1:3000/api/cron/send-reminders";
  let devServerUp = false;
  try {
    const noAuth = await fetch(base);
    devServerUp = noAuth.status === 401;
    report(5, "Reminder route returns 401 without secret", noAuth.status === 401, `status=${noAuth.status}`);
  } catch {
    report(5, "Reminder route returns 401 without secret", false, "dev server not running on :3000");
  }

  if (devServerUp) {
    const withAuth = await fetch(base, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    const body = await withAuth.json();
    const { data: reminderLogs } = await admin
      .from("sms_logs")
      .select("appointment_id, type")
      .eq("type", "reminder");

    const remindedIds = new Set((reminderLogs ?? []).map((r) => r.appointment_id));
    const onlyInside =
      remindedIds.size === 0 ||
      ([...remindedIds].every((id) => id === insideAppt));
    report(
      6,
      "Reminder route (dry-run): only ~24h-out appointment gets a reminder",
      withAuth.status === 200 && body.sent >= 1 && onlyInside,
      `matched=${body.matched}, sent=${body.sent}, failed=${body.failed}, remindedCorrect=${onlyInside}`
    );
  }

  // ---- Test 7 (fix regression): route rejects foreign profileId ------------
  // Regression for the incident where a body-supplied profileId was trusted:
  // a session must not be able to create/link patients rows for someone else.
  const pB7 = await signUpPatient("p7-b@test.local", "test-password-123");
  const foreignAttempt = await fetch("http://127.0.0.1:3000/api/patients/find-or-create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${(
        await pB7.client.auth.getSession()
      ).data.session!.access_token}`,
    },
    body: JSON.stringify({
      phone: "+639198888001",
      fullName: "Imposter Try",
      profileId: pA.uid, // someone else's profile
    }),
  });
  report(
    7,
    "find-or-create rejects profileId belonging to another user (403)",
    foreignAttempt.status === 403,
    `status=${foreignAttempt.status}`
  );

  // ---- Test 8 (fix regression): doctor cannot book appointments -------------
  const docBooking = await createAppointment(doctor, {
    patientId: patRow.id,
    appointmentDate: dateOffset(5),
    appointmentTime: "10:30",
    source: "online",
  });
  report(
    8,
    "createAppointment under doctor session denied by RLS",
    !docBooking.success && /row-level security/i.test(docBooking.success ? "" : docBooking.message),
    docBooking.success ? "unexpectedly succeeded" : docBooking.message.slice(0, 60)
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
