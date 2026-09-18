/*
 * Shared support for the phase harnesses.
 *
 * Every phase harness was written to run against a freshly reset database. They
 * all create fixed-identity rows — fixed emails, fixed dates, fixed slot times —
 * and then assert against them, so a second run (or any other harness run first)
 * collided with its own leftovers:
 *
 *   test-phase2   duplicate key on uq_patients_profile_id (fixed patient rows)
 *   test-phase2   appended another doctor_availability row on every run.
 *                 doctor_availability has no unique constraint on day_of_week,
 *                 so the row just accumulated — which is why test-phase9 later
 *                 found 6 rows where seed.sql creates 5.
 *   test-phase3   duplicate key on availability_exceptions.exception_date
 *                 (that column is unique)
 *   test-phase8   "signup failed: User already registered"
 *   all of them   duplicate key on uq_appointments_slot
 *
 * `resetTestState()` deletes exactly what the harnesses own, so each suite
 * starts from the state a fresh `db reset` would have given it. It is scoped
 * strictly to the test namespace: the `@test.local` accounts, the phone numbers
 * listed below, and the fixed date window the harnesses use. The seeded staff
 * accounts, `clinic_settings`, the seeded weekday hours, and anything created by
 * hand in the app are left alone.
 *
 * Call it as the first statement of a harness's main():
 *
 *   import { resetTestState } from "./test-support";
 *   ...
 *   await resetTestState();
 *
 * Harnesses must therefore not run concurrently — they share one fixture space.
 */
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

/** Every harness account ends in this. Staff are `@clinic.local`, so they survive. */
export const TEST_EMAIL_DOMAIN = "@test.local";

/**
 * Every phone number the harnesses create patients under. Kept explicit rather
 * than pattern-matched so that a future `+6391…` number in real dev data is
 * never swept up by accident. Add a new harness phone here when you add one.
 */
export const TEST_PHONES = [
  // test-phase2
  "+639173333301",
  "+639173333302",
  "+639173333303",
  "+639174444401",
  "+639174444402",
  "+639175555501",
  // test-phase3
  "+639181111001",
  "+639181111002",
  "+639181111003",
  "+639181111004",
  "+639182222001",
  "+639182222002",
  "+639183333002",
  "+639189999001",
  "+639189999002",
  // test-phase4
  "+639194444001",
  "+639194444002",
  // test-phase5
  "+639195555001",
  "+639195555002",
  // test-phase6
  "+639196666001",
  // test-phase7
  "+639197777001",
  "+639198888001",
  // test-phase8
  "+639199998001",
  // test-reschedule
  "+639191111001",
  // test-fee-collections
  "+639191234001",
  "+639191234002",
  // test-senior-priority
  "+639197001001",
  "+639197001002",
  "+639197001003",
] as const;

/**
 * The fixed date window test-phase3 books into (MON..FRI). Only
 * availability_exceptions inside it are removed; no other date is touched.
 */
export const TEST_DATE_FROM = "2026-08-31";
export const TEST_DATE_TO = "2026-09-04";

/** Days the seed inserts. Anything else in doctor_availability is harness-made. */
const SEEDED_WEEKDAYS = [1, 2, 3, 4, 5];

export type ResetSummary = {
  authUsers: number;
  patients: number;
  appointments: number;
  availabilityRows: number;
  exceptions: number;
};

type AdminClient = SupabaseClient;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set — is .env.local present and loadEnvLocal() called first?`
    );
  }
  return value;
}

function testAdmin(): AdminClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  // Same guard the harnesses carry: never point this at a non-local project.
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error(`Refusing to reset test data against a non-local URL: ${url}`);
  }
  return createClient(url, service);
}

/** listUsers() paginates; a local DB is small but do not rely on it. */
async function listAllUsers(admin: AdminClient): Promise<User[]> {
  const perPage = 1000;
  const all: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    all.push(...data.users);
    if (data.users.length < perPage) break;
  }
  return all;
}

/**
 * Remove everything the harnesses own. Safe to call repeatedly, and safe to
 * call when there is nothing to remove.
 */
export async function resetTestState(
  admin: AdminClient = testAdmin()
): Promise<ResetSummary> {
  const users = await listAllUsers(admin);
  const testUserIds = users
    .filter((u) => u.email?.endsWith(TEST_EMAIL_DOMAIN))
    .map((u) => u.id);

  // Patients belonging to a harness account, or created under a harness phone.
  // One person maps to one patients row, and a walk-in has profile_id = null,
  // so both routes in are needed.
  const { data: ownedPatients, error: patientLookupError } = await admin
    .from("patients")
    .select("id")
    .or(
      [
        testUserIds.length
          ? `profile_id.in.(${testUserIds.join(",")})`
          : null,
        `phone.in.(${TEST_PHONES.join(",")})`,
      ]
        .filter(Boolean)
        .join(",")
    );
  if (patientLookupError) {
    throw new Error(`patient lookup failed: ${patientLookupError.message}`);
  }

  const patientIds = (ownedPatients ?? []).map((p: { id: string }) => p.id);

  // appointments.patient_id is ON DELETE RESTRICT, so appointments go first.
  // sms_logs.appointment_id cascades from there.
  let appointments = 0;
  if (patientIds.length) {
    const { data, error } = await admin
      .from("appointments")
      .delete()
      .in("patient_id", patientIds)
      .select("id");
    if (error) throw new Error(`appointment cleanup failed: ${error.message}`);
    appointments = data?.length ?? 0;
  }

  let patients = 0;
  if (patientIds.length) {
    const { data, error } = await admin
      .from("patients")
      .delete()
      .in("id", patientIds)
      .select("id");
    if (error) throw new Error(`patient cleanup failed: ${error.message}`);
    patients = data?.length ?? 0;
  }

  // doctor_availability has no unique constraint on day_of_week, so harness
  // rows for Sunday/Saturday just pile up. Only those two days are removed:
  // the seeded weekdays and anything set by hand in the app stay as they are.
  const { data: availability, error: availabilityError } = await admin
    .from("doctor_availability")
    .delete()
    .not("day_of_week", "in", `(${SEEDED_WEEKDAYS.join(",")})`)
    .select("id");
  if (availabilityError) {
    throw new Error(`availability cleanup failed: ${availabilityError.message}`);
  }

  // exception_date is unique, so a leftover close date makes the next run's
  // insert fail outright. Only the harness date window is cleared.
  const { data: exceptions, error: exceptionError } = await admin
    .from("availability_exceptions")
    .delete()
    .gte("exception_date", TEST_DATE_FROM)
    .lte("exception_date", TEST_DATE_TO)
    .select("id");
  if (exceptionError) {
    throw new Error(`exception cleanup failed: ${exceptionError.message}`);
  }

  // Deleting the auth user cascades to profiles.
  for (const id of testUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      throw new Error(`could not delete test user ${id}: ${error.message}`);
    }
  }

  return {
    authUsers: testUserIds.length,
    patients,
    appointments,
    availabilityRows: availability?.length ?? 0,
    exceptions: exceptions?.length ?? 0,
  };
}
