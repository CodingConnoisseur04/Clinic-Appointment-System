/*
 * Fee collections harness.
 *
 * Covers: amount flows through create/confirm/attendance, the patient
 * self-payment leak is closed at the policy level, the collections report
 * computes correctly, and the clinic-settings fee round-trips.
 *
 * Run order: start `npm run dev`, then
 *   npx tsx scripts/test-fee-collections.ts
 * (no db reset required — resetTestState() clears its own fixtures, same
 * contract as the other harnesses; its phones are registered in
 * test-support.ts).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resetTestState } from "./test-support";
import { createAppointment } from "@/lib/booking/create-appointment";
import {
  confirmAppointment,
  markAttendance,
} from "@/lib/booking/update-appointment";
import { getCollectionSummary } from "@/lib/reports/get-collection-summary";
import { getClinicSettings, upsertClinicSetting } from "@/lib/clinic-settings";

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

async function sessionFor(
  email: string,
  password: string
): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const signUp = await client.auth.signUp({ email, password });
  if (!signUp.error && signUp.data.session && signUp.data.user) {
    return { client, uid: signUp.data.user.id };
  }
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`No session for ${email}: ${signIn.error?.message}`);
  }
  return { client, uid: signIn.data.user.id };
}

async function ensurePatientRow(
  client: SupabaseClient,
  uid: string,
  fullName: string,
  phone: string
) {
  const { data: existing } = await client
    .from("patients")
    .select("id")
    .eq("profile_id", uid)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await client
    .from("patients")
    .insert({ profile_id: uid, full_name: fullName, phone })
    .select()
    .single();
  if (error || !data) throw new Error(`patient row failed: ${error?.message}`);
  return data.id;
}

type PayRow = {
  payment_method: string | null;
  payment_amount: number | null;
  payment_reference: string | null;
};

async function fetchPay(id: string): Promise<PayRow> {
  const { data, error } = await admin
    .from("appointments")
    .select("payment_method, payment_amount, payment_reference")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`fetch appt failed: ${error?.message}`);
  return data as PayRow;
}

// Harness window: inside TEST_DATE_FROM..TO, on a seeded weekday (Mon–Fri).
const MON = "2026-08-31";
const TUE = "2026-09-01";
const WED = "2026-09-02";
const PW = "test-password-123";

async function main() {
  await resetTestState();

  // ---- Setup: patient session + receptionist session ----------------------
  const pA = await sessionFor("fees-a@test.local", PW);
  const rowAId = await ensurePatientRow(pA.client, pA.uid, "Fees A", "+639191234001");

  const rec = anonClient();
  await rec.auth.signInWithPassword({
    email: "receptionist@clinic.local",
    password: "dev-password-only",
  });

  // ---- Test 1: confirmAppointment stores the amount -----------------------
  const s1 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: MON,
    appointmentTime: "09:00",
    source: "online",
  });
  if (!s1.success) throw new Error(`seed1 failed: ${s1.message}`);
  const c1 = await confirmAppointment(rec, {
    appointmentId: s1.appointmentId,
    paymentMethod: "cash",
    paymentReference: "R-1",
    paymentAmount: 500,
  });
  const r1 = await fetchPay(s1.appointmentId);
  report(
    1,
    "confirmAppointment stores amount",
    c1.success && r1.payment_amount === 500 && r1.payment_method === "cash",
    `amount=${r1.payment_amount}, method=${r1.payment_method}`
  );

  // ---- Test 2: amount can be omitted (backward compatible) -----------------
  const s2 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: MON,
    appointmentTime: "09:30",
    source: "online",
  });
  if (!s2.success) throw new Error(`seed2 failed: ${s2.message}`);
  const c2 = await confirmAppointment(rec, {
    appointmentId: s2.appointmentId,
    paymentMethod: "gcash",
  });
  const r2 = await fetchPay(s2.appointmentId);
  report(
    2,
    "confirm without amount still works (null amount)",
    c2.success && r2.payment_amount === null && r2.payment_method === "gcash",
    `amount=${r2.payment_amount}`
  );

  // ---- Test 3: negative amount rejected client-side ------------------------
  const c3 = await confirmAppointment(rec, {
    appointmentId: s2.appointmentId,
    paymentMethod: "cash",
    paymentAmount: -50,
  });
  report(
    3,
    "negative amount rejected before insert",
    !c3.success && c3.reason === "VALIDATION_ERROR",
    c3.success ? "succeeded (BAD)" : c3.reason
  );

  // ---- Test 4: walk-in one-call creation with amount -----------------------
  const w1 = await createAppointment(rec, {
    patientId: rowAId,
    appointmentDate: TUE,
    appointmentTime: "10:00",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: (await rec.auth.getUser()).data.user!.id,
    paymentMethod: "gcash",
    paymentReference: "GC-1",
    paymentAmount: 300.5,
  });
  report(
    4,
    "walk-in one-call creation with amount",
    w1.success && (await fetchPay((w1 as { appointmentId: string }).appointmentId)).payment_amount === 300.5,
    w1.success ? `amount=${(await fetchPay((w1 as { appointmentId: string }).appointmentId)).payment_amount}` : (w1 as { message: string }).message
  );

  // ---- Test 5: markAttendance pay-after logs the fee ----------------------
  const s5 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: TUE,
    appointmentTime: "11:00",
    source: "online",
  });
  if (!s5.success) throw new Error(`seed5 failed: ${s5.message}`);
  await confirmAppointment(rec, { appointmentId: s5.appointmentId, paymentMethod: "cash" });
  const m5 = await markAttendance(rec, {
    appointmentId: s5.appointmentId,
    attendance: "ATTENDED",
    payment: { method: "gcash", reference: "GC-2", amount: 450 },
  });
  const r5 = await fetchPay(s5.appointmentId);
  report(
    5,
    "markAttendance pay-after logs fee",
    m5.success && r5.payment_amount === 450 && r5.payment_method === "gcash",
    `amount=${r5.payment_amount}, method=${r5.payment_method}`
  );

  // ---- Test 6: no-show drops a stray payment, never stores it --------------
  const s6 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: WED,
    appointmentTime: "09:00",
    source: "online",
  });
  if (!s6.success) throw new Error(`seed6 failed: ${s6.message}`);
  await confirmAppointment(rec, { appointmentId: s6.appointmentId, paymentMethod: "cash" });
  const m6 = await markAttendance(rec, {
    appointmentId: s6.appointmentId,
    attendance: "NO_SHOW",
    payment: { method: "cash", amount: 999 },
  });
  const r6 = await fetchPay(s6.appointmentId);
  // The no-show mark must not ADD an amount (999 dropped). The method logged
  // at confirm ("cash") stays — wiping it would erase the prepaid trail that
  // the collections report's no-show split depends on.
  report(
    6,
    "no-show mark adds no amount, preserves confirm-time method",
    m6.success && r6.payment_amount === null && r6.payment_method === "cash",
    `amount=${r6.payment_amount}, method=${r6.payment_method}`
  );

  // ---- Test 7: patient cannot self-set payment fields (policy leak closed) -
  const leak = await pA.client
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: WED,
      appointment_time: "10:00",
      reason: "leak probe",
      source: "online",
      status: "PENDING",
      payment_method: "cash",
      payment_reference: "FAKE-123",
      payment_amount: 1,
    })
    .select("id");
  report(
    7,
    "patient insert with payment fields rejected by policy",
    leak.error !== null,
    leak.error ? `denied: ${leak.error.message.slice(0, 60)}` : "inserted (BAD — leak open)"
  );

  // ---- Test 8: collections report computes correctly -----------------------
  // Current fixtures: MON 09:00 cash 500 ATTENDED?? — attendance not yet set.
  // Mark attendance to build a known mix: r1=attended cash 500 (test sets
  // below), walk1=gcash 300.5 attended, r5=gcash 450 attended, plus a
  // prepaid no-show.
  await markAttendance(rec, {
    appointmentId: s1.appointmentId,
    attendance: "ATTENDED",
  });
  await markAttendance(rec, {
    appointmentId: (w1 as { appointmentId: string }).appointmentId,
    attendance: "ATTENDED",
  });
  // s6 is the no-show with no payment (test 6). Make a prepaid no-show:
  const s8 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: WED,
    appointmentTime: "10:30",
    source: "online",
  });
  if (!s8.success) throw new Error(`seed8 failed: ${s8.message}`);
  await confirmAppointment(rec, {
    appointmentId: s8.appointmentId,
    paymentMethod: "cash",
    paymentAmount: 500,
  });
  await markAttendance(rec, {
    appointmentId: s8.appointmentId,
    attendance: "NO_SHOW",
  });

  const summary = await getCollectionSummary(rec, { from: MON, to: WED });
  // Paid rows: r1 cash500 attended, w1 gcash300.5 attended, r5 gcash450
  // attended, s8 cash500 no-show. s2 confirmed w/o amount (excluded), s5
  // attended via m5 with gcash450... wait — s5 amount=450 method=gcash. Yes.
  // So: total = 500 + 300.5 + 450 + 500 = 1750.5
  const expectedTotal = 500 + 300.5 + 450 + 500;
  const okMath =
    Math.abs(summary.totalCollected - expectedTotal) < 0.001 &&
    summary.paidCount === 4 &&
    Math.abs(summary.cashTotal - 1000) < 0.001 &&
    Math.abs(summary.gcashTotal - 750.5) < 0.001 &&
    Math.abs(summary.attendedTotal - 1250.5) < 0.001 &&
    Math.abs(summary.prepaidNoShowTotal - 500) < 0.001;
  report(
    8,
    "collections report totals correct",
    okMath,
    `total=${summary.totalCollected} (want ${expectedTotal}), paid=${summary.paidCount}, cash=${summary.cashTotal}, gcash=${summary.gcashTotal}, attended=${summary.attendedTotal}, preNoShow=${summary.prepaidNoShowTotal}`
  );

  // ---- Test 9: setting round-trip + defaults -------------------------------
  const before = await getClinicSettings(rec);
  const save = await upsertClinicSetting(rec, "consultation_fee", "350");
  const after = await getClinicSettings(rec);
  report(
    9,
    "consultation_fee setting round-trips",
    save.success && before.consultation_fee !== "350" && after.consultation_fee === "350",
    `before=${before.consultation_fee}, after=${after.consultation_fee}`
  );
  // Restore the migration's default so the UI demo stays predictable.
  await upsertClinicSetting(rec, "consultation_fee", "500");

  console.log(
    failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
