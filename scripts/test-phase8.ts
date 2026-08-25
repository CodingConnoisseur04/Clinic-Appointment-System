import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAppointment } from "@/lib/booking/create-appointment";
import { markAttendance } from "@/lib/booking/update-appointment";
import { sendConfirmationSms } from "@/lib/sms/send-confirmation";
import {
  getNoShowReport,
} from "@/lib/reports/get-no-show-report";
import { getSmsReport } from "@/lib/reports/get-sms-report";
import {
  getAppointmentSummary,
} from "@/lib/reports/get-appointment-summary";

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
void SERVICE;

if (!URL.includes("127.0.0.1")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}
if (process.env.SEMAPHORE_DRY_RUN !== "true") {
  console.error("SEMAPHORE_DRY_RUN must be 'true' to run this harness.");
  process.exit(1);
}

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

async function signUpPatient(email: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: "test-password-123",
    options: { data: { full_name: "P8 Patient", phone: "+639199998001" } },
  });
  if (error || !data.session || !data.user) {
    throw new Error(`signup failed: ${error?.message}`);
  }
  return { client, uid: data.user.id };
}

async function ensurePatientRow(client: SupabaseClient, uid: string) {
  const { data: existing } = await client
    .from("patients")
    .select("id")
    .eq("profile_id", uid)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await client
    .from("patients")
    .insert({ profile_id: uid, full_name: "P8 Patient", phone: "+639199998001" })
    .select()
    .single();
  if (error || !data) throw new Error(`patients row failed: ${error?.message}`);
  return data.id;
}

async function mustCreate(
  result: Promise<Awaited<ReturnType<typeof createAppointment>>>
): Promise<string> {
  const r = await result;
  if (!r.success) throw new Error(`seed failed: ${r.reason} ${r.message}`);
  return r.appointmentId;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function main() {
  const rec = anonClient();
  const doctor = anonClient();
  await signIn(rec, "receptionist@clinic.local", "dev-password-only");
  await signIn(doctor, "doctor@clinic.local", "dev-password-only");
  const recUid = (await rec.auth.getUser()).data.user!.id;
  const pA = await signUpPatient("p8-a@test.local");
  const rowAId = await ensurePatientRow(pA.client, pA.uid);

  // ---- Seed via real lib functions -----------------------------------------
  // Past CONFIRMED: attended / no-show-marked / unmarked; future CONFIRMED.
  const pastAttendedId = await mustCreate(
    createAppointment(rec, {
      patientId: rowAId,
      appointmentDate: dateOffset(-10),
      appointmentTime: "09:00",
      source: "walk_in",
      status: "CONFIRMED",
      handledBy: recUid,
    })
  );
  const pastNoShowId = await mustCreate(
    createAppointment(rec, {
      patientId: rowAId,
      appointmentDate: dateOffset(-9),
      appointmentTime: "09:30",
      source: "online",
      status: "CONFIRMED",
    })
  );
  await mustCreate(
    createAppointment(rec, {
      patientId: rowAId,
      appointmentDate: dateOffset(-8),
      appointmentTime: "10:00",
      source: "walk_in",
      status: "CONFIRMED",
      handledBy: recUid,
    })
  );
  await mustCreate(
    createAppointment(rec, {
      patientId: rowAId,
      appointmentDate: dateOffset(7),
      appointmentTime: "11:00",
      source: "walk_in",
      status: "CONFIRMED",
      handledBy: recUid,
    })
  );

  const m1 = await markAttendance(rec, {
    appointmentId: pastAttendedId,
    attendance: "ATTENDED",
  });
  const m2 = await markAttendance(rec, {
    appointmentId: pastNoShowId,
    attendance: "NO_SHOW",
  });
  if (!m1.success || !m2.success) throw new Error("attendance marking failed");

  // SMS logs: confirmation sent + confirmation failed.
  const smsOk = await sendConfirmationSms(rec, pastAttendedId);
  const smsFail = await sendConfirmationSms(rec, pastNoShowId, {
    simulateFailure: true,
  });
  if (!smsOk.delivered || smsFail.delivered) throw new Error("sms seeding failed");

  const range = { from: dateOffset(-31), to: dateOffset(31) };

  // ---- Test 1: no-show report ----------------------------------------------
  const nsRec = await getNoShowReport(rec, range);
  report(
    1,
    "getNoShowReport splits attended/marked/inferred, excludes future",
    nsRec.attended === 1 &&
      nsRec.noShowMarked === 1 &&
      nsRec.noShowInferred === 1 &&
      nsRec.totalPastConfirmed === 3 &&
      nsRec.noShowRatePercent === Math.round((2 / 3) * 100),
    `attended=${nsRec.attended}, marked=${nsRec.noShowMarked}, inferred=${nsRec.noShowInferred}, total=${nsRec.totalPastConfirmed}, rate=${nsRec.noShowRatePercent}%`
  );

  // ---- Test 2: SMS report counts match seeded mix ---------------------------
  const smsRepRec = await getSmsReport(rec, range);
  report(
    2,
    "getSmsReport counts match seeded mix",
    smsRepRec.confirmationSent === 1 && smsRepRec.confirmationFailed === 1,
    `sent=${smsRepRec.confirmationSent}, failed=${smsRepRec.confirmationFailed}`
  );

  // ---- Test 3: appointment summary matches seeded mix -----------------------
  // Seeded this run: 4 appointments by creation time. Other suites may have
  // added rows in-range on the same DB state, so assert >= and exact mix of
  // OUR rows via a tight range around today only.
  const sumRecToday = await getAppointmentSummary(rec, {
    from: dateOffset(-1),
    to: dateOffset(1),
  });
  const sumRec = await getAppointmentSummary(rec, range);
  report(
    3,
    "getAppointmentSummary status/source counts match seeded mix",
    sumRec.confirmed >= 4 &&
      sumRec.walkIn >= 3 &&
      sumRec.online >= 1 &&
      sumRecToday.confirmed >= 1 &&
      sumRec.pending + sumRec.confirmed + sumRec.cancelled ===
        sumRec.online + sumRec.walkIn,
    `confirmed=${sumRec.confirmed}, walkin=${sumRec.walkIn}, online=${sumRec.online}, todayConfirmed=${sumRecToday.confirmed}`
  );
  void sumRec;

  // ---- Test 4: scope-correctness for doctor/patient sessions ----------------
  const smsDoc = await getSmsReport(doctor, range);
  const nsDoc = await getNoShowReport(doctor, range);

  // Doctor: CONFIRMED-only scope coincides with what the no-show report needs
  // (so its numbers legitimately match the receptionist's); has NO sms_logs
  // access at all (all zeros). Patient: sees only their own rows — a subset.
  const nsRecCheck = await getNoShowReport(rec, range);
  const nsPat = await getNoShowReport(pA.client, range);
  const docNsMatches = JSON.stringify(nsDoc) === JSON.stringify(nsRecCheck);
  report(
    4,
    "Scope-correctness: doctor sms=zeros, reports scoped not rejected",
    smsDoc.confirmationSent === 0 &&
      smsDoc.reminderSent === 0 &&
      docNsMatches &&
      nsPat.totalPastConfirmed <= nsRecCheck.totalPastConfirmed,
    `docSmsSent=${smsDoc.confirmationSent}, docNoShowMatchesRec=${docNsMatches}, patTotal=${nsPat.totalPastConfirmed}`
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
