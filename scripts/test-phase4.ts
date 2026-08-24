import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAppointment } from "@/lib/booking/create-appointment";
import {
  confirmAppointment,
  rejectAppointment,
  markAttendance,
} from "@/lib/booking/update-appointment";

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

// These tests exercise the REAL src/lib modules directly (tsx resolves the
// @/ alias) — closing the mirror gap flagged in Phase 3's known issues.

type ApptRow = {
  id: string;
  status: string;
  source: string;
  payment_method: string | null;
  payment_reference: string | null;
  handled_by: string | null;
  attendance: string | null;
};

async function fetchAppt(id: string): Promise<ApptRow> {
  const { data, error } = await admin
    .from("appointments")
    .select(
      "id, status, source, payment_method, payment_reference, handled_by, attendance"
    )
    .eq("id", id)
    .single();
  if (error || !data) throw new Error(`fetch appt failed: ${error?.message}`);
  return data as ApptRow;
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

const TUE = "2026-10-06";
const WED = "2026-10-07";
const THU = "2026-10-08";
const PW = "test-password-123";

async function main() {
  // ---- Setup: two patient accounts with their own patients rows ----------
  const pA = await sessionFor("p4-a@test.local", PW);
  const pB = await sessionFor("p4-b@test.local", PW);

  const rowAId = await ensurePatientRow(pA.client, pA.uid, "P4 A", "+639194444001");
  const rowBId = await ensurePatientRow(pB.client, pB.uid, "P4 B", "+639194444002");

  const doctor = anonClient();
  const rec = anonClient();
  await doctor.auth.signInWithPassword({ email: "doctor@clinic.local", password: "dev-password-only" });
  await rec.auth.signInWithPassword({ email: "receptionist@clinic.local", password: "dev-password-only" });

  const users = (await admin.auth.admin.listUsers()).data.users ?? [];
  const recUid = users.find((u) => u.email === "receptionist@clinic.local")!.id;

  // ---- Test 1: confirmAppointment sets status + both payment fields ------
  const seed1 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: TUE,
    appointmentTime: "09:00",
    reason: "confirm test",
    source: "online",
  });
  if (!seed1.success) throw new Error(`seed1 failed: ${seed1.message}`);

  const c1 = await confirmAppointment(rec, {
    appointmentId: seed1.appointmentId,
    paymentMethod: "cash",
    paymentReference: "R-100",
  });
  const afterConfirm = await fetchAppt(seed1.appointmentId);
  report(
    1,
    "confirmAppointment sets CONFIRMED + payment fields",
    c1.success &&
      afterConfirm.status === "CONFIRMED" &&
      afterConfirm.payment_method === "cash" &&
      afterConfirm.payment_reference === "R-100",
    `status=${afterConfirm.status}, method=${afterConfirm.payment_method}, ref=${afterConfirm.payment_reference}`
  );

  // ---- Test 2: rejectAppointment sets CANCELLED ---------------------------
  const seed2 = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: TUE,
    appointmentTime: "09:30",
    reason: "reject test",
    source: "online",
  });
  if (!seed2.success) throw new Error(`seed2 failed: ${seed2.message}`);

  const c2 = await rejectAppointment(rec, { appointmentId: seed2.appointmentId });
  const afterReject = await fetchAppt(seed2.appointmentId);
  report(
    2,
    "rejectAppointment sets CANCELLED",
    c2.success && afterReject.status === "CANCELLED",
    `status=${afterReject.status}`
  );

  // ---- Test 3: markAttendance writes ATTENDED and NO_SHOW -----------------
  const walk1 = await createAppointment(rec, {
    patientId: rowBId,
    appointmentDate: WED,
    appointmentTime: "09:00",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: recUid,
    paymentMethod: "cash",
    paymentReference: "W-1",
  });
  const walk2 = await createAppointment(rec, {
    patientId: rowBId,
    appointmentDate: WED,
    appointmentTime: "09:30",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: recUid,
    paymentMethod: "gcash",
    paymentReference: "W-2",
  });
  if (!walk1.success || !walk2.success) {
    throw new Error(`walk-in seeds failed: ${(walk1 as {message:string}).message} / ${(walk2 as {message:string}).message}`);
  }

  const m1 = await markAttendance(rec, { appointmentId: walk1.appointmentId, attendance: "ATTENDED" });
  const m2 = await markAttendance(rec, { appointmentId: walk2.appointmentId, attendance: "NO_SHOW" });
  const att1 = await fetchAppt(walk1.appointmentId);
  const att2 = await fetchAppt(walk2.appointmentId);
  report(
    3,
    "markAttendance writes ATTENDED and NO_SHOW",
    m1.success && m2.success && att1.attendance === "ATTENDED" && att2.attendance === "NO_SHOW",
    `att1=${att1.attendance}, att2=${att2.attendance}`
  );

  // ---- Test 4: one-call CONFIRMED creation with payment fields ------------
  const t4 = await createAppointment(rec, {
    patientId: rowBId,
    appointmentDate: THU,
    appointmentTime: "09:00",
    reason: "one-call confirm",
    source: "walk_in",
    status: "CONFIRMED",
    handledBy: recUid,
    paymentMethod: "gcash",
    paymentReference: "GC-777",
  });
  const t4row = t4.success ? await fetchAppt(t4.appointmentId) : null;
  report(
    4,
    "createAppointment one-call CONFIRMED + payment",
    !!t4row &&
      t4row.status === "CONFIRMED" &&
      t4row.source === "walk_in" &&
      t4row.payment_method === "gcash" &&
      t4row.payment_reference === "GC-777" &&
      t4row.handled_by === recUid,
    t4row ? `status=${t4row.status}, method=${t4row.payment_method}` : (t4 as { message: string }).message
  );

  // ---- Test 5: same functions via a PATIENT session are denied by RLS -----
  const d1 = await confirmAppointment(pB.client, {
    appointmentId: walk1.appointmentId,
    paymentMethod: "cash",
  });
  const d2 = await rejectAppointment(pB.client, { appointmentId: walk1.appointmentId });
  const d3 = await markAttendance(pB.client, {
    appointmentId: walk1.appointmentId,
    attendance: "NO_SHOW",
  });
  const deniedReason = (r: Awaited<ReturnType<typeof confirmAppointment>>) =>
    !r.success && r.reason === "NOT_FOUND_OR_DENIED";
  const denied = deniedReason(d1) && deniedReason(d2) && deniedReason(d3);
  report(
    5,
    "Patient session denied on all three updates (RLS)",
    denied,
    `confirm=${d1.success ? "succeeded" : d1.reason}, reject=${d2.success ? "succeeded" : d2.reason}, mark=${d3.success ? "succeeded" : d3.reason}`
  );

  // ---- Test 6 note ---------------------------------------------------------
  console.log(
    "[INFO] Test 6 = existing scripts/test-phase3.ts suite, run separately unmodified."
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
