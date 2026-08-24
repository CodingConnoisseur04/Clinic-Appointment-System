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

async function sessionFor(
  email: string,
  password: string,
  metadata?: Record<string, unknown>
): Promise<{ client: SupabaseClient; uid: string; token: string }> {
  const client = anonClient();
  const signUp = await client.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });
  if (signUp.error || !signUp.data.session || !signUp.data.user) {
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data.session) {
      throw new Error(`No session for ${email}: ${signIn.error?.message}`);
    }
    return {
      client,
      uid: signIn.data.user.id,
      token: signIn.data.session.access_token,
    };
  }
  return {
    client,
    uid: signUp.data.user.id,
    token: signUp.data.session.access_token,
  };
}

// Local copies of the lib functions under test. The src/ modules are
// Next.js-path-dependent ("@/" aliases), so scripts mirror them here and the
// routes themselves are tested live in Test 6.
async function getAvailableSlots(
  supabase: SupabaseClient,
  date: string
): Promise<string[]> {
  const closed = await supabase
    .from("availability_exceptions")
    .select("id")
    .eq("exception_date", date)
    .maybeSingle();
  if (closed.data) return [];

  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
  const { data: hours } = await supabase
    .from("doctor_availability")
    .select("start_time, end_time, slot_duration_minutes")
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true);
  if (!hours || hours.length === 0) return [];

  const { data: booked } = await supabase
    .from("appointments")
    .select("appointment_time")
    .eq("appointment_date", date)
    .neq("status", "CANCELLED");
  const taken = new Set((booked ?? []).map((b) => b.appointment_time.slice(0, 5)));

  const out: string[] = [];
  for (const h of hours) {
    const [sh, sm] = h.start_time.split(":").map(Number);
    const [eh, em] = h.end_time.split(":").map(Number);
    for (let t = sh * 60 + sm; t + h.slot_duration_minutes <= eh * 60 + em; t += h.slot_duration_minutes) {
      const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
      if (!taken.has(time)) out.push(time);
    }
  }
  return [...new Set(out)].sort();
}

type CreateResult =
  | { success: true; appointmentId: string }
  | { success: false; reason: "SLOT_TAKEN" | "CLOSED_DATE" | "VALIDATION_ERROR"; message: string };

async function createAppointment(
  supabase: SupabaseClient,
  input: {
    patientId: string;
    appointmentDate: string;
    appointmentTime: string;
    reason?: string;
    source: "online" | "walk_in";
    handledBy?: string;
  }
): Promise<CreateResult> {
  if (input.source === "walk_in" && !input.handledBy) {
    return { success: false, reason: "VALIDATION_ERROR", message: "handledBy required" };
  }
  const closed = await supabase
    .from("availability_exceptions")
    .select("id")
    .eq("exception_date", input.appointmentDate)
    .maybeSingle();
  if (closed.data) {
    return { success: false, reason: "CLOSED_DATE", message: `closed on ${input.appointmentDate}` };
  }
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: input.patientId,
      appointment_date: input.appointmentDate,
      appointment_time: input.appointmentTime,
      reason: input.reason ?? null,
      source: input.source,
      status: "PENDING",
      handled_by: input.handledBy ?? null,
    })
    .select("id")
    .single();
  if (!error && data) return { success: true, appointmentId: data.id };
  if (
    error &&
    (error.code === "23505" ||
      (error as { details?: string }).details?.includes("uq_appointments_slot") ||
      error.message.includes("uq_appointments_slot"))
  ) {
    return { success: false, reason: "SLOT_TAKEN", message: "slot taken" };
  }
  return { success: false, reason: "VALIDATION_ERROR", message: error?.message ?? "unknown" };
}

async function findOrCreatePatient(
  supabase: SupabaseClient,
  input: {
    phone: string;
    fullName: string;
    profileId?: string;
  }
): Promise<{ patientId: string; wasExisting: boolean }> {
  const { data: existing } = await supabase
    .from("patients")
    .select("id, profile_id")
    .eq("phone", input.phone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.profile_id === null && input.profileId) {
      const update = await supabase
        .from("patients")
        .update({ profile_id: input.profileId, full_name: input.fullName })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (!update.error && update.data) {
        return { patientId: update.data.id, wasExisting: true };
      }
      if (update.error.code === "23505") {
        const linked = await supabase
          .from("patients")
          .select("id")
          .eq("profile_id", input.profileId)
          .limit(1)
          .maybeSingle();
        if (linked.data) return { patientId: linked.data.id, wasExisting: true };
      }
      throw new Error(update.error.message);
    }
    return { patientId: existing.id, wasExisting: true };
  }

  const insert = await supabase
    .from("patients")
    .insert({ phone: input.phone, full_name: input.fullName, profile_id: input.profileId ?? null })
    .select("id")
    .single();
  if (insert.error || !insert.data) throw new Error(insert.error?.message ?? "insert failed");
  return { patientId: insert.data.id, wasExisting: false };
}

const MON = "2026-08-31";
const TUE = "2026-09-01";
const WED = "2026-09-02";
const THU = "2026-09-03";
const FRI = "2026-09-04";
const PW = "test-password-123";

async function main() {
  // ---- Test 1: uq_patients_profile_id holds --------------------------------
  const pA = await sessionFor("p3-a@test.local", PW, { full_name: "P3 A", phone: "+639181111001" });
  const pB = await sessionFor("p3-b@test.local", PW, { full_name: "P3 B", phone: "+639181111002" });

  const dup1 = await admin
    .from("patients")
    .insert({ profile_id: pA.uid, full_name: "First", phone: "+639182222001" })
    .select()
    .single();
  const dup2 = await admin
    .from("patients")
    .insert({ profile_id: pA.uid, full_name: "Dupe", phone: "+639182222002" })
    .select();
  report(
    1,
    "uq_patients_profile_id blocks second row per profile",
    !dup1.error && !!dup2.error,
    `secondErr=${dup2.error?.message ?? "none"}`
  );
  const rowAId = dup1.data!.id;

  // ---- Test 2: availability_exceptions RLS shape ---------------------------
  const doctor = anonClient();
  const rec = anonClient();
  await doctor.auth.signInWithPassword({ email: "doctor@clinic.local", password: "dev-password-only" });
  await rec.auth.signInWithPassword({ email: "receptionist@clinic.local", password: "dev-password-only" });

  const users = (await admin.auth.admin.listUsers()).data.users ?? [];
  const recUid = users.find((u) => u.email === "receptionist@clinic.local")!.id;

  const docExc = await doctor
    .from("availability_exceptions")
    .insert({ exception_date: TUE, reason: "conference" })
    .select()
    .single();
  const recExc = await rec
    .from("availability_exceptions")
    .insert({ exception_date: THU })
    .select();
  const patRead = await pA.client.from("availability_exceptions").select("*");
  report(
    2,
    "Exceptions RLS: doctor writes, receptionist cannot, all read",
    !docExc.error && !!recExc.error && !patRead.error,
    `docErr=${docExc.error?.message ?? "none"}, recBlocked=${!!recExc.error}, patRows=${patRead.data?.length}`
  );

  // ---- Test 3: slots on a normal weekday -----------------------------------
  const t3 = await getAvailableSlots(admin, MON);
  report(
    3,
    "Normal weekday slot list",
    t3.length === 16 && t3[0] === "09:00" && t3[t3.length - 1] === "16:30",
    `count=${t3.length}, first=${t3[0]}, last=${t3[t3.length - 1]}`
  );

  // ---- Test 4: exception date short-circuits -------------------------------
  const t4 = await getAvailableSlots(admin, TUE);
  report(4, "Exception date returns []", t4.length === 0, `count=${t4.length}`);

  // ---- Test 5: booked excluded, cancelled re-included ----------------------
  const seedBooked = await admin
    .from("appointments")
    .insert({
      patient_id: rowAId,
      appointment_date: WED,
      appointment_time: "10:30",
      source: "walk_in",
    })
    .select()
    .single();
  const wedWithBooking = await getAvailableSlots(admin, WED);
  const excludedOk = !wedWithBooking.includes("10:30");

  await admin
    .from("appointments")
    .update({ status: "CANCELLED" })
    .eq("id", seedBooked.data!.id);
  const wedAfterCancel = await getAvailableSlots(admin, WED);
  const reincludedOk = wedAfterCancel.includes("10:30");
  report(
    5,
    "Booked slot excluded, cancelled re-included",
    !seedBooked.error && excludedOk && reincludedOk,
    `excluded=${excludedOk}, reincluded=${reincludedOk}`
  );

  // ---- Test 7 setup: patients rows for A and B -----------------------------
  const rowB = await pB.client
    .from("patients")
    .insert({ profile_id: pB.uid, full_name: "P3 B", phone: "+639183333002" })
    .select()
    .single();
  if (rowB.error) throw new Error(`rowB insert failed: ${rowB.error.message}`);

  // ---- Test 7: createAppointment online + walk-in --------------------------
  const online = await createAppointment(pA.client, {
    patientId: rowAId,
    appointmentDate: FRI,
    appointmentTime: "09:00",
    reason: "online request",
    source: "online",
  });
  const walkin = await createAppointment(rec, {
    patientId: rowB.data!.id,
    appointmentDate: FRI,
    appointmentTime: "10:00",
    source: "walk_in",
    handledBy: recUid,
  });
  report(
    7,
    "createAppointment online + walk-in succeed",
    online.success && walkin.success,
    `online=${online.success ? "ok" : (online as { message: string }).message}, walkin=${walkin.success ? "ok" : (walkin as { message: string }).message}`
  );

  // ---- Test 9: CLOSED_DATE before insert -----------------------------------
  const docCloseWed = await doctor
    .from("availability_exceptions")
    .insert({ exception_date: WED, reason: "sick day" })
    .select()
    .single();
  const t9 = await createAppointment(pB.client, {
    patientId: rowB.data!.id,
    appointmentDate: WED,
    appointmentTime: "09:00",
    source: "online",
  });
  report(
    9,
    "CLOSED_DATE returned before insert",
    !docCloseWed.error && !t9.success && t9.reason === "CLOSED_DATE",
    t9.success ? "unexpectedly succeeded" : `reason=${t9.reason}`
  );

  // ---- Test 6: route with authenticated patient + anon gate ----------------
  let devServerUp = false;
  try {
    const res = await fetch("http://127.0.0.1:3000/api/available-slots?date=x");
    devServerUp = res.status === 401;
    if (!devServerUp) {
      console.log(`[WARN] unexpected route status for bad date: ${res.status}`);
    }
  } catch {
    console.log("[WARN] dev server not running on :3000 — starting it for Test 6");
  }

  let t6pass = false;
  let t6detail = "";
  if (!devServerUp) {
    try {
      await fetch("http://127.0.0.1:3000/");
    } catch {
      t6detail = "dev server unreachable — Test 6 not run against live route; ";
    }
  }

  // Book B into Thu 09:00 via B's own session first.
  const bThu = await createAppointment(pB.client, {
    patientId: rowB.data!.id,
    appointmentDate: THU,
    appointmentTime: "09:00",
    source: "online",
  });
  if (!bThu.success) {
    t6detail += `setup failed (${bThu.reason}); `;
  }

  const scopedView = await getAvailableSlots(pA.client, THU);
  const underCountProof = scopedView.includes("09:00");

  try {
    const res = await fetch(
      `http://127.0.0.1:3000/api/available-slots?date=${THU}`,
      { headers: { Authorization: `Bearer ${pA.token}` } }
    );
    const body = await res.json();
    const times: string[] = (body.slots ?? []).map((s: { time: string }) => s.time);
    const anonRes = await fetch(
      `http://127.0.0.1:3000/api/available-slots?date=${THU}`
    );
    t6pass =
      res.status === 200 &&
      !times.includes("09:00") &&
      underCountProof &&
      anonRes.status === 401;
    t6detail += `routeStatus=${res.status}, routeHidesBooked=${!times.includes("09:00")}, patientSessionUndercounts=${underCountProof}, anonGated=${anonRes.status === 401}`;
  } catch (e) {
    t6detail += `route fetch failed: ${(e as Error).message}`;
  }
  report(6, "Route (admin-backed) correct for authenticated caller", t6pass, t6detail);

  // ---- Test 8: concurrent same-slot inserts --------------------------------
  const [r1, r2] = await Promise.all([
    createAppointment(pA.client, {
      patientId: rowAId,
      appointmentDate: FRI,
      appointmentTime: "11:00",
      source: "online",
    }),
    createAppointment(pB.client, {
      patientId: rowB.data!.id,
      appointmentDate: FRI,
      appointmentTime: "11:00",
      source: "online",
    }),
  ]);
  const outcomes = [r1, r2];
  const wins = outcomes.filter((r) => r.success).length;
  const typedRejections = outcomes.filter((r) => !r.success && r.reason === "SLOT_TAKEN").length;
  report(
    8,
    "Concurrent inserts: one win, typed SLOT_TAKEN loss",
    wins === 1 && typedRejections === 1,
    `wins=${wins}, slotTaken=${typedRejections}`
  );

  // ---- Tests 10 & 11: findOrCreatePatient ----------------------------------
  const pD = await sessionFor("p3-d@test.local", PW, { full_name: "P3 D", phone: "+639181111004" });
  const walkinPhone = "+639189999001";
  const walkinRow = await rec
    .from("patients")
    .insert({ profile_id: null, full_name: "Walk-In Wes", phone: walkinPhone })
    .select()
    .single();
  const t10 = await findOrCreatePatient(admin, {
    phone: walkinPhone,
    fullName: "Walk-In Wes",
    profileId: pD.uid,
  });
  const t10Linked = t10.patientId === walkinRow.data?.id;
  report(
    10,
    "findOrCreatePatient reuses walk-in record by phone",
    !walkinRow.error && t10.wasExisting && t10Linked,
    `sameId=${t10Linked}, wasExisting=${t10.wasExisting}`
  );

  const freshPhone = "+639189999002";
  const t11 = await findOrCreatePatient(admin, {
    phone: freshPhone,
    fullName: "Brand New",
  });
  report(11, "findOrCreatePatient creates when no match", !t11.wasExisting, `wasExisting=${t11.wasExisting}`);

  // ---- Test 12: end-to-end fresh patient journey ---------------------------
  const pC = await sessionFor("p3-c@test.local", PW, { full_name: "P3 C", phone: "+639181111003" });
  const cReg = await findOrCreatePatient(admin, {
    phone: "+639181111003",
    fullName: "P3 C",
    profileId: pC.uid,
  });
  const cAppt = await createAppointment(pC.client, {
    patientId: cReg.patientId,
    appointmentDate: MON,
    appointmentTime: "14:00",
    reason: "e2e",
    source: "online",
  });
  report(
    12,
    "End-to-end: signup -> register -> book",
    cReg.wasExisting === false && cAppt.success,
    cAppt.success ? "ok" : (cAppt as { message: string }).message
  );

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
