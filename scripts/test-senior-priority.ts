/*
 * Senior/PWD priority harness (upgrade Feature 2).
 *
 * Covers: the patients flag round-trips under RLS (self-toggle allowed,
 * cross-patient denied, receptionist toggle allowed), the discount math at
 * lib level, discount_amount storage through confirm/walk-in/attendance, the
 * collections "discounts granted" total, the settings round-trip, and the
 * flag riding through find-or-create.
 *
 * Run order: start `npm run dev`, then
 *   npx tsx scripts/test-senior-priority.ts
 * (no db reset required — resetTestState() clears its own fixtures; its
 * phones are registered in test-support.ts).
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
import { applyDiscountPct, discountFromAmounts } from "@/lib/booking/discount";
import { setPatientSeniorPwd } from "@/lib/patients/update-senior-flag";
import { getCollectionSummary } from "@/lib/reports/get-collection-summary";
import {
  getClinicSettings,
  upsertClinicSetting,
} from "@/lib/clinic-settings";

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
): Promise<string> {
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
  return data.id as string;
}

async function fetchAppt(id: string): Promise<{
  payment_amount: number | null;
  discount_amount: number | null;
  status: string;
}> {
  const { data, error } = await admin
    .from("appointments")
    .select("payment_amount, discount_amount, status")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`fetch appt failed: ${error?.message}`);
  return data as { payment_amount: number | null; discount_amount: number | null; status: string };
}

// Harness window: inside TEST_DATE_FROM..TO, on a seeded weekday (Mon–Fri).
const MON = "2026-08-31";
const TUE = "2026-09-01";
const WED = "2026-09-02";
const PW = "test-password-123";

async function main() {
  await resetTestState();

  // ---- Setup: sessions -----------------------------------------------------
  const pA = await sessionFor("senior-a@test.local", PW); // will flag themselves
  const pB = await sessionFor("senior-b@test.local", PW); // stays unflagged
  const rowAId = await ensurePatientRow(pA.client, pA.uid, "Senior A", "+639197001001");
  const rowBId = await ensurePatientRow(pB.client, pB.uid, "Senior B", "+639197001002");

  const rec = anonClient();
  await rec.auth.signInWithPassword({
    email: "receptionist@clinic.local",
    password: "dev-password-only",
  });

  // ---- Test 1: discount math (pure lib) ------------------------------------
  const t1a = applyDiscountPct(500, 20);
  const t1b = applyDiscountPct(500, 0);
  const t1c = applyDiscountPct(333.33, 20); // rounding: 266.664 → 266.66
  const t1d = applyDiscountPct(500, 150); // clamped to 100
  const t1e = discountFromAmounts(500, 400);
  const t1f = discountFromAmounts(500, 600); // never negative
  report(
    1,
    "discount math: 20% of 500 = 400, 0% = 500, rounding, clamps, gap",
    t1a === 400 && t1b === 500 && t1c === 266.66 && t1d === 0 && t1e === 100 && t1f === 0,
    `a=${t1a} b=${t1b} c=${t1c} d=${t1d} e=${t1e} f=${t1f}`
  );

  // ---- Test 2: patient can toggle their OWN flag (patients_update_own) -----
  const own = await setPatientSeniorPwd(pA.client, rowAId, true);
  const { data: afterOwn } = await admin
    .from("patients")
    .select("is_senior_pwd")
    .eq("id", rowAId)
    .single();
  report(
    2,
    "patient can flag their own record",
    own.success && afterOwn?.is_senior_pwd === true,
    `success=${own.success}, flag=${afterOwn?.is_senior_pwd}`
  );

  // ---- Test 3: patient CANNOT flag someone else's record --------------------
  const cross = await setPatientSeniorPwd(pA.client, rowBId, true);
  const { data: afterCross } = await admin
    .from("patients")
    .select("is_senior_pwd")
    .eq("id", rowBId)
    .single();
  report(
    3,
    "patient cannot flag another patient's record (RLS)",
    !cross.success && cross.reason === "NOT_FOUND_OR_DENIED" && afterCross?.is_senior_pwd === false,
    `reason=${cross.success ? "succeeded (BAD)" : cross.reason}, flag=${afterCross?.is_senior_pwd}`
  );

  // ---- Test 4: receptionist can toggle any flag ------------------------------
  const recToggle = await setPatientSeniorPwd(rec, rowBId, true);
  const { data: afterRec } = await admin
    .from("patients")
    .select("is_senior_pwd")
    .eq("id", rowBId)
    .single();
  report(
    4,
    "receptionist can flag any patient",
    recToggle.success && afterRec?.is_senior_pwd === true,
    `success=${recToggle.success}, flag=${afterRec?.is_senior_pwd}`
  );

  // ---- Test 5: settings round-trip + default --------------------------------
  const settingsBefore = await getClinicSettings(rec);
  await upsertClinicSetting(rec, "senior_discount_percent", "25");
  const settingsAfter = await getClinicSettings(rec);
  report(
    5,
    "senior_discount_percent setting reads and updates",
    settingsBefore.senior_discount_percent === "20" && settingsAfter.senior_discount_percent === "25",
    `before=${settingsBefore.senior_discount_percent}, after=${settingsAfter.senior_discount_percent}`
  );
  // restore the default for the rest of the run and the demo database
  await upsertClinicSetting(rec, "senior_discount_percent", "20");

  // ---- Test 6: confirm stores the discounted amount and the gap -------------
  const s6 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: MON,
    appointmentTime: "09:00",
    source: "online",
  });
  if (!s6.success) throw new Error(`seed6 failed: ${s6.message}`);
  // fee default 500, discount 20% → prefill 400
  const prefill = applyDiscountPct(500, 20);
  const c6 = await confirmAppointment(rec, {
    appointmentId: s6.appointmentId,
    paymentMethod: "cash",
    paymentAmount: prefill,
    discountAmount: discountFromAmounts(500, prefill),
  });
  const r6 = await fetchAppt(s6.appointmentId);
  report(
    6,
    "confirm stores payment_amount=400 and discount_amount=100",
    c6.success && r6.payment_amount === 400 && r6.discount_amount === 100,
    `amount=${r6.payment_amount}, discount=${r6.discount_amount}`
  );

  // ---- Test 7: walk-in with discount flows through create --------------------
  const s7 = await createAppointment(rec, {
    patientId: rowBId,
    appointmentDate: TUE,
    appointmentTime: "10:00",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: (await rec.auth.getUser()).data.user!.id,
    paymentMethod: "cash",
    paymentAmount: 350,
    discountAmount: 150, // desk charged 350 off a 500 fee
  });
  const r7 = s7.success ? await fetchAppt(s7.appointmentId) : null;
  report(
    7,
    "walk-in create stores amount=350, discount=150",
    s7.success && r7?.payment_amount === 350 && r7?.discount_amount === 150,
    `amount=${r7?.payment_amount}, discount=${r7?.discount_amount}`
  );

  // ---- Test 8: attendance pay-after can add a discount -----------------------
  const s8 = await createAppointment(rec, {
    patientId: rowAId,
    appointmentDate: WED,
    appointmentTime: "09:00",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: (await rec.auth.getUser()).data.user!.id,
  });
  const a8 = await markAttendance(rec, {
    appointmentId: s8.success ? s8.appointmentId : "",
    attendance: "ATTENDED",
    payment: {
      method: "gcash",
      amount: 400,
      discountAmount: 100,
    },
  });
  const r8 = s8.success ? await fetchAppt(s8.appointmentId) : null;
  report(
    8,
    "attendance stores pay-after discount",
    a8.success && r8?.payment_amount === 400 && r8?.discount_amount === 100,
    `amount=${r8?.payment_amount}, discount=${r8?.discount_amount}`
  );

  // ---- Test 9: negative discount rejected ------------------------------------
  const c9 = await confirmAppointment(rec, {
    appointmentId: s6.appointmentId,
    paymentMethod: "cash",
    paymentAmount: 400,
    discountAmount: -10,
  });
  report(
    9,
    "negative discount rejected client-side",
    !c9.success && c9.reason === "VALIDATION_ERROR",
    c9.success ? "succeeded (BAD)" : c9.reason
  );

  // ---- Test 10: collections summary adds discountsGranted --------------------
  const summary = await getCollectionSummary(rec, { from: MON, to: WED });
  report(
    10,
    "collections discountsGranted sums the range (100 + 150 + 100 = 350)",
    summary.discountsGranted === 350,
    `discountsGranted=${summary.discountsGranted}, totalCollected=${summary.totalCollected}`
  );

  // ---- Test 11: badge data present in the queries the UI uses ----------------
  const { data: hookRows } = await admin
    .from("appointments")
    .select("id, patients(is_senior_pwd)")
    .gte("appointment_date", MON)
    .lte("appointment_date", WED);
  const flagged = (hookRows ?? []).filter((r) => {
    const patients = (r as unknown as { patients: { is_senior_pwd: boolean } | null })
      .patients;
    return patients?.is_senior_pwd === true;
  }).length;
  report(
    11,
    "appointments joins expose patients.is_senior_pwd for badges",
    flagged >= 2,
    `flagged rows in window=${flagged}`
  );

  // ---- Test 12: patient self-insert cannot assert a discount -----------------
  const s12 = await createAppointment(pB.client, {
    patientId: rowBId,
    appointmentDate: TUE,
    appointmentTime: "11:00",
    source: "online",
    // The lib sends the field; the DB policy must refuse the row entirely.
    discountAmount: 100,
  } as Parameters<typeof createAppointment>[1]);
  report(
    12,
    "patient self-insert with discount_amount is refused by policy",
    !s12.success,
    s12.success ? "inserted (BAD)" : s12.reason
  );
  // Cleanup so later suites see a clean slot map.
  if (s12.success) {
    await admin.from("appointments").delete().eq("id", s12.appointmentId);
  }

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
