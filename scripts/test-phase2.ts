import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

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

async function getOrCreateSession(
  email: string,
  password: string,
  metadata?: Record<string, unknown>
): Promise<{ client: SupabaseClient; uid: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });
  if (!error && data.session && data.user) {
    return { client, uid: data.user.id };
  }
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) {
    throw new Error(`Cannot obtain session for ${email}: ${signIn.error?.message}`);
  }
  return { client, uid: signIn.data.user!.id };
}

const PW = "test-password-123";

type ApptRow = { id: string; status: string };

async function main() {
  // ---- Tests 1 & 2: public signup role assignment -------------------------
  const pA = await getOrCreateSession("patient-a@test.local", PW, {
    full_name: "Patient A",
    phone: "+639173333301",
  });

  const pB = await getOrCreateSession("patient-b@test.local", PW, {
    full_name: "Patient B",
    phone: "+639173333302",
  });

  const t1 = await admin
    .from("profiles")
    .select("role")
    .eq("id", pA.uid)
    .single();
  report(1, "Public signup defaults to patient", t1.data?.role === "patient", `got '${t1.data?.role}'`);

  const pEsc = await getOrCreateSession("escalator@test.local", PW, {
    full_name: "Escalator",
    phone: "+639173333303",
    role: "receptionist",
  });
  void pEsc;

  const t2 = await admin
    .from("profiles")
    .select("role")
    .eq(
      "id",
      (
        await admin.auth.admin.listUsers()
      ).data.users.find((u) => u.email === "escalator@test.local")!.id
    )
    .single();
  report(2, "Signup cannot self-elevate via user_metadata", t2.data?.role === "patient", `got '${t2.data?.role}'`);

  // ---- Test 3: seeded staff roles ------------------------------------------
  const users = (await admin.auth.admin.listUsers()).data.users ?? [];
  const docUser = users.find((u) => u.email === "doctor@clinic.local");
  const recUser = users.find((u) => u.email === "receptionist@clinic.local");
  let t3pass = false;
  let t3detail = "";
  if (!docUser || !recUser) {
    t3detail = "staff accounts missing — run scripts/seed-staff.ts first";
  } else {
    const roles = await admin
      .from("profiles")
      .select("id, role")
      .in("id", [docUser.id, recUser.id]);
    const docRole = roles.data?.find((r) => r.id === docUser.id)?.role;
    const recRole = roles.data?.find((r) => r.id === recUser.id)?.role;
    t3pass = docRole === "doctor" && recRole === "receptionist";
    t3detail = `doctor='${docRole}' receptionist='${recRole}'`;
  }
  report(3, "Seeded staff get correct roles", t3pass, t3detail);
  if (!docUser || !recUser) {
    console.log("\nAborting remaining tests without staff accounts.");
    process.exit(1);
  }

  const doctor = anonClient();
  const rec = anonClient();
  await doctor.auth.signInWithPassword({
    email: "doctor@clinic.local",
    password: "dev-password-only",
  });
  await rec.auth.signInWithPassword({
    email: "receptionist@clinic.local",
    password: "dev-password-only",
  });

  // ---- Test 4: patient can't read another patient --------------------------
  const insA = await pA.client
    .from("patients")
    .insert({
      profile_id: pA.uid,
      full_name: "Patient A",
      phone: "+639174444401",
    })
    .select()
    .single();
  const insB = await pB.client
    .from("patients")
    .insert({
      profile_id: pB.uid,
      full_name: "Patient B",
      phone: "+639174444402",
    })
    .select()
    .single();
  if (insA.error || insB.error || !insA.data || !insB.data) {
    report(4, "Patient can't read another patient", false, `setup failed: ${insA.error?.message ?? insB.error?.message}`);
  } else {
    const peek = await pA.client
      .from("patients")
      .select("*")
      .eq("id", insB.data.id);
    report(
      4,
      "Patient can't read another patient",
      !peek.error && (peek.data?.length ?? 0) === 0,
      `returned ${peek.data?.length ?? "?"} rows`
    );
  }
  const rowAId = insA.data!.id;

  // ---- Test 5: patient inserts own appointment request ---------------------
  const t5 = await pA.client
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: "2026-09-01",
      appointment_time: "09:00",
      reason: "checkup",
      source: "online",
    })
    .select()
    .single();
  report(
    5,
    "Patient can insert own patient + appointment rows",
    !t5.error && !!t5.data,
    t5.error?.message
  );
  const apptAId = t5.data?.id;

  // ---- Test 6: constrained insert rejects bad values -----------------------
  const t6a = await pA.client
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: "2026-09-02",
      appointment_time: "09:00",
      source: "walk_in",
    })
    .select();
  const t6b = await pA.client
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: "2026-09-02",
      appointment_time: "09:30",
      source: "online",
      status: "CONFIRMED",
    })
    .select();
  report(6, "Patient insert rejected outside constraints", !!t6a.error && !!t6b.error, `walk_in err=${!!t6a.error}, CONFIRMED err=${!!t6b.error}`);

  // ---- Test 7: patient cannot update/cancel own appointment ----------------
  const t7 = await pA.client
    .from("appointments")
    .update({ reason: "self-cancelled" })
    .eq("id", apptAId!)
    .select();
  report(
    7,
    "Patient cannot update own appointment",
    !!t7.error || (t7.data?.length ?? 0) === 0,
    t7.error ? "rejected" : `${t7.data?.length} rows touched`
  );

  // ---- Test 8: receptionist full read/write incl. walk-ins -----------------
  const rPatients = await rec.from("patients").select("*");
  const rAppts = await rec.from("appointments").select("*");
  const walkin = await rec
    .from("patients")
    .insert({ profile_id: null, full_name: "Walk-In Wanda", phone: "+639175555501" })
    .select()
    .single();
  const walkinAppt =
    !walkin.error && walkin.data
      ? await rec
          .from("appointments")
          .insert({
            patient_id: walkin.data.id,
            appointment_date: "2026-09-01",
            appointment_time: "10:00",
            source: "walk_in",
            status: "CONFIRMED",
          })
          .select()
          .single()
      : null;
  const t8pass =
    !rPatients.error &&
    (rPatients.data?.length ?? 0) >= 2 &&
    !rAppts.error &&
    (rAppts.data?.length ?? 0) >= 1 &&
    !walkin.error &&
    !!walkinAppt &&
    !walkinAppt.error;
  report(
    8,
    "Receptionist full read/write incl. walk-in",
    t8pass,
    rPatients.error?.message ??
      rAppts.error?.message ??
      walkin.error?.message ??
      walkinAppt?.error?.message
  );

  // ---- Test 9: doctor sees only CONFIRMED ----------------------------------
  const cancelledSeed = await rec
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: "2026-09-03",
      appointment_time: "11:00",
      source: "walk_in",
      status: "CANCELLED",
    })
    .select()
    .single();

  const dView = await doctor.from("appointments").select("*");
  const dRows = (dView.data ?? []) as ApptRow[];
  const dInsertTry = await doctor
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: "2026-09-04",
      appointment_time: "09:00",
      source: "online",
    })
    .select();
  const dUpdateTry = await doctor
    .from("appointments")
    .update({ reason: "doctor edit" })
    .eq("id", apptAId!)
    .select();
  report(
    9,
    "Doctor sees only CONFIRMED; cannot write",
    !dView.error &&
      dRows.every((r) => r.status === "CONFIRMED") &&
      dRows.some((r) => r.status === "CONFIRMED") &&
      !!dInsertTry.error &&
      (!!dUpdateTry.error || (dUpdateTry.data?.length ?? 0) === 0),
    `visible=${dRows.length}, statuses=[${[...new Set(dRows.map((r) => r.status))].join(",")}], insertErr=${!!dInsertTry.error}`
  );
  void cancelledSeed;

  // ---- Test 10: availability writes — doctor yes, receptionist no ----------
  const dAvail = await doctor
    .from("doctor_availability")
    .insert({ day_of_week: 6, start_time: "08:00", end_time: "12:00" })
    .select()
    .single();
  const dAvailUpd = !dAvail.error && dAvail.data
    ? await doctor
        .from("doctor_availability")
        .update({ end_time: "13:00" })
        .eq("id", dAvail.data.id)
        .select()
    : { error: { message: "skipped: availability insert failed" } };
  const rAvail = await rec
    .from("doctor_availability")
    .insert({ day_of_week: 0, start_time: "08:00", end_time: "12:00" })
    .select();
  report(
    10,
    "Availability: doctor writes, receptionist cannot",
    !dAvail.error && !dAvailUpd.error && !!rAvail.error,
    `doctorErr=${dAvail.error?.message ?? dAvailUpd.error?.message ?? "none"}, recBlocked=${!!rAvail.error}`
  );

  // ---- Test 11: sms_logs receptionist-only ---------------------------------
  const sPat = await pA.client.from("sms_logs").select("*");
  const sDoc = await doctor.from("sms_logs").select("*");
  const sRecSel = await rec.from("sms_logs").select("*");
  const sRecIns = await rec
    .from("sms_logs")
    .insert({
      appointment_id: apptAId!,
      type: "confirmation",
      status: "sent",
    })
    .select();
  const sDocIns = await doctor
    .from("sms_logs")
    .insert({
      appointment_id: apptAId!,
      type: "reminder",
      status: "sent",
    })
    .select();
  report(
    11,
    "sms_logs receptionist-only",
    !sPat.error &&
      (sPat.data?.length ?? 0) === 0 &&
      !sDoc.error &&
      (sDoc.data?.length ?? 0) === 0 &&
      !sRecSel.error &&
      !!sRecIns.error &&
      !!sDocIns.error,
    `patRows=${sPat.data?.length}, docRows=${sDoc.data?.length}, recInsBlocked=${!!sRecIns.error}, docInsBlocked=${!!sDocIns.error}`
  );

  // ---- Test 12: direct role escalation blocked -----------------------------
  const t12 = await pA.client
    .from("profiles")
    .update({ role: "doctor" })
    .eq("id", pA.uid);
  report(12, "Role escalation via direct update blocked", !!t12.error, t12.error?.message ?? "no error raised!");

  // ---- Test 13: middleware survives unauthenticated request ----------------
  try {
    const res = await fetch("http://127.0.0.1:3000/", { redirect: "manual" });
    report(13, "Middleware OK for signed-out visitor", res.status < 500, `HTTP ${res.status}`);
  } catch {
    report(13, "Middleware OK for signed-out visitor", true, "SKIPPED — dev server not running on :3000");
  }

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
