/*
 * Reschedule harness — scripts/test-reschedule.ts
 *
 * Covers src/lib/booking/reschedule-appointment.ts (the receptionist's
 * in-place move) through a real receptionist session, plus the RLS denial for
 * a patient session and the confirmation-SMS reuse path under dry-run.
 *
 * Run order: npx supabase db reset -> npx tsx scripts/seed-staff.ts ->
 * npx tsx scripts/test-reschedule.ts   (no dev server needed; the lib and the
 * real provider path are exercised directly, not through routes).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resetTestState, TEST_EMAIL_DOMAIN } from "./test-support";
import { rescheduleAppointment } from "@/lib/booking/reschedule-appointment";
import { createAppointment } from "@/lib/booking/create-appointment";
import { findOrCreatePatient } from "@/lib/patients/find-or-create-patient";
import { rejectAppointment } from "@/lib/booking/update-appointment";
import { addException, removeException } from "@/lib/availability/manage-exceptions";
import { sendConfirmationSms } from "@/lib/sms/send-confirmation";

function loadEnvLocal() {
  const file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DRY_RUN = process.env.SEMAPHORE_DRY_RUN === "true";

if (!URL.includes("127.0.0.1") && !URL.includes("localhost")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE);
const PW = "dev-password-only";

let failures = 0;
function report(step: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] ${step}${detail ? ` — ${detail}` : ""}`);
}

/** First future Mon–Fri date at least `minDaysOut` days from today (local). */
function nextWeekday(minDaysOut: number): string {
  const base = new Date();
  for (let offset = minDaysOut; offset <= minDaysOut + 14; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  throw new Error("no weekday found within two weeks");
}

/** Yesterday's local date (for the past-appointment fixture). */
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Hours = { start_time: string; end_time: string; slot_duration_minutes: number };

/** First `count` bookable times for a weekday, from the LIVE availability rows. */
async function slotsFor(date: string, count: number): Promise<string[]> {
  const dow = new Date(`${date}T00:00:00`).getDay();
  const { data, error } = await admin
    .from("doctor_availability")
    .select("start_time, end_time, slot_duration_minutes")
    .eq("day_of_week", dow)
    .eq("is_active", true);
  if (error || !data || data.length === 0) {
    throw new Error(`no availability rows for ${date} (weekday ${dow}) — seed missing?`);
  }
  const h = (data as Hours[])[0];
  const [sh, sm] = h.start_time.slice(0, 5).split(":").map(Number);
  const minutes = sh * 60 + sm;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return Array.from(
    { length: count },
    (_, i) => fmt(minutes + i * h.slot_duration_minutes)
  );
}

async function signInAs(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
  return client;
}

async function makePatient(fullName: string, phone: string, email: string) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (error || !created.user) throw new Error(`signup failed: ${error?.message}`);
  const patientClient = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: signInErr } = await patientClient.auth.signInWithPassword({ email, password: PW });
  if (signInErr) throw new Error(`patient sign-in failed: ${signInErr.message}`);
  const found = await findOrCreatePatient(patientClient, {
    phone,
    fullName,
    profileId: created.user.id,
  });
  if (!("patientId" in found) || !found.patientId) {
    throw new Error(`find-or-create failed: ${JSON.stringify(found)}`);
  }
  return { patientId: found.patientId, client: patientClient };
}

async function main() {
  await resetTestState();
  console.log("Test state reset.\n");

  const rec = await signInAs(`receptionist@clinic.local`);
  const doctor = await signInAs(`doctor@clinic.local`);

  const dateA = nextWeekday(2);
  const [aSlot1, aSlot2] = await slotsFor(dateA, 2);
  const dateB = nextWeekday(4);
  const [bSlot1, bSlot2, bSlot3] = await slotsFor(dateB, 3);

  // Rerun hygiene: a previous crashed run could have left a closure on one of
  // this run's fixture dates (test-support's window only covers the phase-3
  // dates). Clear those two dates unconditionally before seeding fixtures.
  for (const d of [dateA, dateB]) {
    await admin.from("availability_exceptions").delete().eq("exception_date", d);
  }

  const { patientId, client: patientClient } = await makePatient(
    "Reschedule Test Patient",
    "+639191111001",
    `reschedule-${Date.now()}${TEST_EMAIL_DOMAIN}`
  );

  // Fixtures: PENDING future (A1), CONFIRMED future (A2), second future
  // CONFIRMED to prove slot-taken (A3), past CONFIRMED (A4).
  const mk = async (input: Parameters<typeof createAppointment>[1]) => {
    const r = await createAppointment(rec, input);
    if (!r.success) throw new Error(`fixture create failed: ${r.reason} ${r.message}`);
    return r.appointmentId;
  };
  /* Fixture map (all under one patient):
   *   a1 PENDING  dateA aSlot1   (moved by T1, vacating aSlot1)
   *   a2 CONFIRMED dateA aSlot2  (moved by T2 INTO the vacated aSlot1)
   *   a3 CONFIRMED dateB bSlot1  (the "other live appointment" for T4/T5/T8)
   *   a4 CONFIRMED yesterday     (past records must not move)
   * Free targets used: dateB bSlot2 (nobody), vacated dateA slots.
   */
  const a1 = await mk({ patientId, appointmentDate: dateA, appointmentTime: aSlot1, source: "online" });
  const a2 = await mk({
    patientId, appointmentDate: dateA, appointmentTime: aSlot2, source: "walk_in",
    status: "CONFIRMED", handledBy: (await rec.auth.getUser()).data.user!.id,
  });
  const a3 = await mk({
    patientId, appointmentDate: dateB, appointmentTime: bSlot1, source: "walk_in",
    status: "CONFIRMED", handledBy: (await rec.auth.getUser()).data.user!.id,
  });
  const a4 = await mk({
    patientId, appointmentDate: yesterday(), appointmentTime: aSlot1, source: "walk_in",
    status: "CONFIRMED", handledBy: (await rec.auth.getUser()).data.user!.id,
  });

  // T1 — PENDING moves in place, same row id.
  const t1 = await rescheduleAppointment(rec, { appointmentId: a1, newDate: dateB, newTime: bSlot2 });
  const t1row = t1.success
    ? (await admin.from("appointments").select("id, appointment_date, appointment_time, status").eq("id", a1).single()).data
    : null;
  report(
    "T1 PENDING future moves, same row kept",
    t1.success &&
      !!t1row &&
      t1row.appointment_date === dateB &&
      t1row.appointment_time.slice(0, 5) === bSlot2 &&
      t1row.status === "PENDING",
    t1.success ? `moved to ${dateB} ${bSlot2}` : t1.message
  );

  // T2 — CONFIRMED moves and stays CONFIRMED — into the slot T1 just
  // vacated, proving a moved-out slot is immediately reusable.
  const t2 = await rescheduleAppointment(rec, { appointmentId: a2, newDate: dateA, newTime: aSlot1 });
  const t2row = t2.success
    ? (await admin.from("appointments").select("status, appointment_date, appointment_time").eq("id", a2).single()).data
    : null;
  report(
    "T2 CONFIRMED moves into vacated slot, status kept",
    t2.success && !!t2row && t2row.status === "CONFIRMED" && t2row.appointment_time.slice(0, 5) === aSlot1,
    t2.success ? `${dateA} ${aSlot2} -> ${dateA} ${aSlot1}` : t2.message
  );

  // T3 — moving onto itself is refused.
  const t3 = await rescheduleAppointment(rec, { appointmentId: a2, newDate: dateA, newTime: aSlot1 });
  report("T3 same slot refused", !t3.success && t3.reason === "SAME_SLOT", t3.success ? "moved?!" : t3.reason);

  // T4 — moving onto a live appointment's slot is refused at the index.
  const t4 = await rescheduleAppointment(rec, { appointmentId: a3, newDate: dateB, newTime: bSlot2 });
  report("T4 occupied slot refused (SLOT_TAKEN)", !t4.success && t4.reason === "SLOT_TAKEN", t4.success ? "moved?!" : t4.reason);

  // T5 — a closed date is refused (availability_exceptions are doctor-writable).
  const added = await addException(doctor, { date: dateA, reason: "reschedule harness closure" });
  if (!added.success) throw new Error(`addException failed: ${added.message}`);
  const t5 = await rescheduleAppointment(rec, { appointmentId: a3, newDate: dateA, newTime: aSlot2 });
  report("T5 closed date refused (CLOSED_DATE)", !t5.success && t5.reason === "CLOSED_DATE", t5.success ? "moved?!" : t5.reason);
  const removed = await removeException(doctor, { id: added.id });
  report("T5b closure removed afterwards", removed.success, removed.success ? "" : removed.message);

  // T6 — past appointments refuse to move.
  const t6 = await rescheduleAppointment(rec, { appointmentId: a4, newDate: dateB, newTime: bSlot2 });
  report("T6 past appointment refused (PAST_APPOINTMENT)", !t6.success && t6.reason === "PAST_APPOINTMENT", t6.success ? "moved?!" : t6.reason);

  // T6b/T6c — today's boundary, both sides of "has it started yet". Each side
  // skips politely when the clock does not cooperate with the fixture window.
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const todayStr = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const fmtMin = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  if (nowMin >= 120) {
    // Started 90 minutes ago today: movable to nobody.
    const aTodayStarted = await mk({
      patientId, appointmentDate: todayStr, appointmentTime: fmtMin(nowMin - 90),
      source: "walk_in", status: "CONFIRMED",
      handledBy: (await rec.auth.getUser()).data.user!.id,
    });
    const t6b = await rescheduleAppointment(rec, { appointmentId: aTodayStarted, newDate: dateB, newTime: bSlot3 });
    report("T6b today already-started refused", !t6b.success && t6b.reason === "PAST_APPOINTMENT", t6b.success ? "moved?!" : t6b.reason);
  } else {
    console.log("[SKIP] T6b — too close to midnight for a started-today fixture");
  }

  if (nowMin <= 22 * 60) {
    // Starts 90 minutes from now today: the desk CAN move it (human decision).
    const aTodayFuture = await mk({
      patientId, appointmentDate: todayStr, appointmentTime: fmtMin(nowMin + 90),
      source: "walk_in", status: "CONFIRMED",
      handledBy: (await rec.auth.getUser()).data.user!.id,
    });
    const t6c = await rescheduleAppointment(rec, { appointmentId: aTodayFuture, newDate: dateB, newTime: bSlot3 });
    report(
      "T6c today not-yet-started moves",
      t6c.success,
      t6c.success ? `${todayStr} ${fmtMin(nowMin + 90)} -> ${dateB} ${bSlot3}` : t6c.message
    );
  } else {
    console.log("[SKIP] T6c — too late in the day for a future-today fixture");
  }

  // T6d — a move TARGETED at a today-time that already passed is refused,
  // even though the appointment being moved is perfectly movable.
  if (nowMin >= 120) {
    const t6d = await rescheduleAppointment(rec, { appointmentId: a3, newDate: todayStr, newTime: fmtMin(nowMin - 90) });
    report(
      "T6d move into a passed today-time refused",
      !t6d.success && t6d.reason === "VALIDATION_ERROR",
      t6d.success ? "moved?!" : t6d.reason
    );
  } else {
    console.log("[SKIP] T6d — too close to midnight for a passed-today target");
  }

  // T7 — cancelled appointments refuse to move.
  const cancelled = await rejectAppointment(rec, { appointmentId: a1 });
  if (!cancelled.success) throw new Error(`rejectAppointment failed: ${cancelled.message}`);
  const t7 = await rescheduleAppointment(rec, { appointmentId: a1, newDate: dateA, newTime: aSlot2 });
  report("T7 cancelled refused (ALREADY_CANCELLED)", !t7.success && t7.reason === "ALREADY_CANCELLED", t7.success ? "moved?!" : t7.reason);

  // T8 — a patient session cannot move its own appointment (RLS blocks the
  // write). Target is a genuinely different slot so the same-slot guard does
  // not mask the denial; bSlot1 is occupied by a3, which a receptionist WOULD
  // be told is SLOT_TAKEN — a patient is told nothing, because RLS hides it.
  const t8 = await rescheduleAppointment(patientClient, { appointmentId: a2, newDate: dateB, newTime: bSlot1 });
  const t8row = (await admin.from("appointments").select("appointment_date, appointment_time").eq("id", a2).single()).data;
  report(
    "T8 patient session denied, row untouched",
    !t8.success && t8.reason === "NOT_FOUND_OR_DENIED" && !!t8row && t8row.appointment_time.slice(0, 5) === aSlot1,
    t8.success ? "moved?!" : t8.reason
  );

  // T9 — the reuse SMS path logs a confirmation row for the moved appointment
  // (dry-run only; this harness never spends real credit).
  if (DRY_RUN) {
    const sms = await sendConfirmationSms(rec, a2);
    const { data: logs } = await admin
      .from("sms_logs")
      .select("type, status, provider_response")
      .eq("appointment_id", a2);
    const rows = logs ?? [];
    report(
      "T9 rescheduled CONFIRMED re-texts via confirmation path (dry-run)",
      sms.logged && sms.delivered && rows.length === 1 && rows[0].type === "confirmation" && rows[0].status === "sent",
      rows.map((l) => `${l.type}/${l.status}/${l.provider_response}`).join("; ") || "no rows"
    );
  } else {
    console.log("[SKIP] T9 — SEMAPHORE_DRY_RUN is not true; real-send guard engaged.");
  }

  console.log(
    failures === 0 ? "\nReschedule harness: ALL CHECKS PASSED" : `\nReschedule harness: ${failures} check(s) FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
