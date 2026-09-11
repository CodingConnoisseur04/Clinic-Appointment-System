import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resetTestState } from "./test-support";
import { createAppointment } from "@/lib/booking/create-appointment";
import { findOrCreatePatient } from "@/lib/patients/find-or-create-patient";

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

async function signUpPatient(
  email: string,
  password: string,
  fullName: string,
  phone: string
): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });
  if (error || !data.session || !data.user) {
    throw new Error(`signup failed for ${email}: ${error?.message}`);
  }
  return { client, uid: data.user.id };
}

// Real src/lib modules — the exact code the patient UI calls.

type CreateResult = Awaited<ReturnType<typeof createAppointment>>;

async function createOnlineRequest(
  supabase: SupabaseClient,
  patientId: string,
  date: string,
  time: string
): Promise<CreateResult> {
  return createAppointment(supabase, {
    patientId,
    appointmentDate: date,
    appointmentTime: time,
    source: "online",
  });
}

const MON = "2026-11-02"; // fresh week, clear of other suites
const PW = "test-password-123";

async function main() {
  // Idempotent: clear anything a previous harness run left behind.
  await resetTestState();

  // ---- Test 1: fresh signup has no patients row; find-or-create makes one -
  const pA = await signUpPatient("p5-a@test.local", PW, "P5 A", "+639195555001");
  const preCheck = await admin
    .from("patients")
    .select("id")
    .eq("profile_id", pA.uid)
    .maybeSingle();

  const reg = await findOrCreatePatient(admin, {
    phone: "+639195555001",
    fullName: "P5 A",
    profileId: pA.uid,
  });
  if ("error" in reg) throw new Error(`registration failed: ${reg.error}`);
  const postRow = await admin
    .from("patients")
    .select("id, profile_id")
    .eq("profile_id", pA.uid)
    .single();
  report(
    1,
    "Fresh signup -> findOrCreatePatient creates patients row",
    !preCheck.data && !reg.wasExisting && !!postRow.data,
    `hadRowBefore=${!!preCheck.data}, wasExisting=${reg.wasExisting}`
  );
  const rowAId = reg.patientId;

  // ---- Test 2: online request defaults to PENDING -------------------------
  const t2 = await createOnlineRequest(pA.client, rowAId, MON, "09:00");
  let t2row: { status: string; source: string } | null = null;
  if (t2.success) {
    const { data } = await admin
      .from("appointments")
      .select("status, source")
      .eq("id", t2.appointmentId)
      .single();
    t2row = data;
  }
  report(
    2,
    "createAppointment online defaults to PENDING",
    t2.success && t2row?.status === "PENDING" && t2row?.source === "online",
    t2.success ? `status=${t2row?.status}` : t2.message
  );

  // ---- Test 3: second booking reuses same patients row --------------------
  const reg2 = await findOrCreatePatient(admin, {
    phone: "+639195555001",
    fullName: "P5 A",
    profileId: pA.uid,
  });
  const dupCount = await admin
    .from("patients")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", pA.uid);
  report(
    3,
    "Returning patient reuses patients row (no duplicate)",
    !("error" in reg2) &&
      reg2.wasExisting &&
      reg2.patientId === rowAId &&
      (dupCount.count ?? 0) === 1,
    `rows=${dupCount.count}, sameId=${!("error" in reg2) && reg2.patientId === rowAId}`
  );

  // ---- Test 4: Patient A cannot see Patient B's appointments ---------------
  const pB = await signUpPatient("p5-b@test.local", PW, "P5 B", "+639195555002");
  const regB = await findOrCreatePatient(admin, {
    phone: "+639195555002",
    fullName: "P5 B",
    profileId: pB.uid,
  });
  if ("error" in regB) throw new Error(`regB failed: ${regB.error}`);

  const bAppt = await createOnlineRequest(pB.client, regB.patientId, MON, "10:00");
  if (!bAppt.success) throw new Error(`B booking failed: ${bAppt.message}`);

  const aView = await pA.client.from("appointments").select("*");
  const seesOnlyOwn =
    !aView.error &&
    (aView.data ?? []).every((r) => r.patient_id === rowAId);
  report(
    4,
    "Patient A sees only own appointments",
    seesOnlyOwn,
    `rows=${aView.data?.length ?? "?"}, allOwn=${seesOnlyOwn}`
  );

  // ---- Test 5: concurrent booking of same slot -> typed SLOT_TAKEN --------
  const [c1, c2] = await Promise.all([
    createOnlineRequest(pA.client, rowAId, MON, "11:00"),
    createAppointment(pB.client, {
      patientId: regB.patientId,
      appointmentDate: MON,
      appointmentTime: "11:00",
      source: "online",
    }),
  ]);
  const wins = [c1, c2].filter((r) => r.success).length;
  const typedLoss = [c1, c2].filter((r) => !r.success && r.reason === "SLOT_TAKEN").length;
  report(
    5,
    "Concurrent same-slot requests: one wins, typed SLOT_TAKEN",
    wins === 1 && typedLoss === 1,
    `wins=${wins}, slotTaken=${typedLoss}`
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
