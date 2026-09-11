import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resetTestState } from "./test-support";
import { getSchedule } from "@/lib/schedule/get-schedule";
import { updateWorkingHours } from "@/lib/availability/update-hours";
import {
  addException,
  removeException,
} from "@/lib/availability/manage-exceptions";
import { getAvailableSlots } from "@/lib/booking/get-available-slots";

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

if (!URL.includes("127.0.0.1")) {
  console.error("Refusing to run against a non-local URL.");
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

async function signIn(
  client: SupabaseClient,
  email: string,
  password: string
) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
}

// Real src/lib modules under test.

async function fetchAvailabilityRow(
  dayOfWeek: number
): Promise<{ id: string; start_time: string; end_time: string }> {
  const { data, error } = await admin
    .from("doctor_availability")
    .select("id, start_time, end_time")
    .eq("day_of_week", dayOfWeek)
    .single();
  if (error || !data) throw new Error(`availability row missing: ${error?.message}`);
  return data;
}

async function insertAppt(
  patientId: string,
  date: string,
  time: string,
  status: "PENDING" | "CONFIRMED"
): Promise<string> {
  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_id: patientId,
      appointment_date: date,
      appointment_time: time,
      source: "walk_in",
      status,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`seed appt failed: ${error?.message}`);
  return data.id;
}

const MON = "2026-12-07"; // a Monday, fresh week clear of other suites
const TUE = "2026-12-08";
const PW = "test-password-123";

async function main() {
  // Idempotent: clear anything a previous harness run left behind.
  await resetTestState();

  // ---- Setup ---------------------------------------------------------------
  const doctor = anonClient();
  const rec = anonClient();
  await signIn(doctor, "doctor@clinic.local", "dev-password-only");
  await rec.auth.signInWithPassword({
    email: "receptionist@clinic.local",
    password: "dev-password-only",
  });

  const patient = anonClient();
  const signUp = await patient.auth.signUp({
    email: "p6-a@test.local",
    password: PW,
    options: { data: { full_name: "P6 A", phone: "+639196666001" } },
  });
  if (!signUp.data.session || !signUp.data.user) {
    throw new Error(`patient signup failed: ${signUp.error?.message}`);
  }
  const pUid = signUp.data.user.id;

  const { data: patRow, error: patErr } = await admin
    .from("patients")
    .insert({ profile_id: pUid, full_name: "P6 A", phone: "+639196666001" })
    .select()
    .single();
  if (patErr || !patRow) throw new Error(`patients row failed: ${patErr?.message}`);

  // ---- Test 1: getSchedule returns only CONFIRMED in range, joined ---------
  await insertAppt(patRow.id, MON, "09:00", "CONFIRMED"); // in range, visible
  await insertAppt(patRow.id, MON, "10:00", "PENDING");   // in range, hidden
  await insertAppt(patRow.id, "2026-12-14", "11:00", "CONFIRMED"); // out of range

  const sched = await getSchedule(doctor, { from: MON, to: TUE });
  const joinedOk =
    sched.length === 1 &&
    sched[0].appointment_date === MON &&
    sched[0].appointment_time.startsWith("09:00") &&
    sched[0].patients?.full_name === "P6 A" &&
    !!sched[0].patients?.phone;
  report(1, "getSchedule: CONFIRMED-only in range, patient joined", joinedOk, `rows=${sched.length}`);

  // ---- Test 2: scope-correctness for other roles ----------------------------
  // Receptionist has full read access BY DESIGN (Phase 2 appointments_select_staff),
  // so "rejected by RLS" is impossible; assert scope-correctness instead:
  // receptionist sees >= doctor's view; patient sees exactly their OWN rows
  // (both CONFIRMED and PENDING of theirs, nothing belonging to others).
  const recSched = await getSchedule(rec, { from: MON, to: TUE });
  const patSched = await getSchedule(patient, { from: MON, to: TUE });
  const { data: ownIds } = await admin
    .from("appointments")
    .select("id")
    .eq("patient_id", patRow.id)
    .gte("appointment_date", MON)
    .lte("appointment_date", TUE);
  const expectedOwn = new Set((ownIds ?? []).map((r) => r.id));
  const gotIds = new Set((patSched ?? []).map((r) => r.id));
  const sameSet =
    expectedOwn.size === gotIds.size &&
    [...expectedOwn].every((id) => gotIds.has(id));
  report(
    2,
    "getSchedule scope-correct for rec (full) and patient (own rows only)",
    (recSched ?? []).length >= (sched ?? []).length && sameSet,
    `recRows=${recSched.length}, patRows=${patSched.length}, matchesOwnExactly=${sameSet}`
  );

  // ---- Test 3: updateWorkingHours — doctor yes, others no -------------------
  const monRow = await fetchAvailabilityRow(1);

  const uDoc = await updateWorkingHours(doctor, {
    id: monRow.id,
    startTime: "10:00",
    endTime: "16:00",
    isActive: true,
  });
  const uRec = await updateWorkingHours(rec, {
    id: monRow.id,
    startTime: "08:00",
    endTime: "18:00",
    isActive: true,
  });
  const uPat = await updateWorkingHours(patient, {
    id: monRow.id,
    startTime: "08:00",
    endTime: "18:00",
    isActive: true,
  });
  report(
    3,
    "updateWorkingHours: doctor succeeds; rec/patient denied by RLS",
    uDoc.success &&
      !uRec.success &&
      !uPat.success &&
      uRec.reason === "NOT_FOUND_OR_DENIED" &&
      uPat.reason === "NOT_FOUND_OR_DENIED",
    `doc=${uDoc.success ? `ok, conflicts=${uDoc.conflictingAppointments}` : uDoc.reason}, rec=${uRec.success ? "succeeded!" : uRec.reason}, pat=${uPat.success ? "succeeded!" : uPat.reason}`
  );
  void monRow.start_time;
  void monRow.end_time;

  // ---- Test 4: add/remove exceptions — doctor yes, others no ----------------
  const excDate = "2026-12-24"; // Thursday, not otherwise used
  const aDoc = await addException(doctor, { date: excDate, reason: "conference" });
  const aRec = await addException(rec, { date: "2026-12-26" });
  const aPat = await addException(patient, { date: "2026-12-27" });

  let rDoc = false;
  if (aDoc.success) {
    const rm = await removeException(doctor, { id: aDoc.id });
    rDoc = rm.success;
  } else {
    rDoc = false;
  }
  // Re-add so Test 5 can use it.
  const reAdd = await addException(doctor, { date: excDate, reason: "conference" });

  report(
    4,
    "Exceptions: doctor add/remove succeeds; rec/patient denied by RLS",
    aDoc.success && rDoc && !aRec.success && !aPat.success && reAdd.success,
    `rec=${aRec.success ? "succeeded!" : aRec.reason}, pat=${aPat.success ? "succeeded!" : aPat.reason}`
  );

  // ---- Test 5: closure via real module feeds Phase 3's getAvailableSlots ----
  const slotsAfterClosure = await getAvailableSlots(admin, excDate); // Thursday
  const slotsBeforePolicy = await getAvailableSlots(admin, TUE);     // Tuesday, open
  report(
    5,
    "Doctor-created closure -> getAvailableSlots returns [] for that date",
    slotsAfterClosure.length === 0 && slotsBeforePolicy.length === 16,
    `closed=${slotsAfterClosure.length}, openTuesday=${slotsBeforePolicy.length}`
  );

  // ---- Test 6: conflict count reported, write proceeds ----------------------
  // MON 09:00 already has a CONFIRMED appointment (Test 1).
  const withConflict = await addException(doctor, { date: MON, reason: "conflict test" });
  const withoutConflict = await addException(doctor, { date: "2026-12-31" }); // Wednesday, empty
  report(
    6,
    "addException reports conflictingAppointments count; writes succeed",
    withConflict.success &&
      withoutConflict.success &&
      withConflict.conflictingAppointments >= 1 &&
      withoutConflict.conflictingAppointments === 0,
    `with=${withConflict.success ? withConflict.conflictingAppointments : withConflict.message}, without=${withoutConflict.success ? withoutConflict.conflictingAppointments : withoutConflict.message}`
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
