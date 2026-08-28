import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
void process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL.includes("127.0.0.1")) {
  console.error("Refusing to run against a non-local URL.");
  process.exit(1);
}

let failures = 0;
function report(n: number, name: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] Test ${n}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  // Plain anon client — no session anywhere.
  const anon = createClient(URL, ANON);

  // ---- Test 1: anon can READ doctor_availability ---------------------------
  const { data, error } = await anon
    .from("doctor_availability")
    .select("*")
    .order("day_of_week");
  report(
    1,
    "anon can read doctor_availability (landing-page hours)",
    !error && (data?.length ?? 0) === 5,
    error ? error.message : `rows=${data?.length}`
  );

  // ---- Test 2: anon still cannot WRITE doctor_availability -----------------
  const writeAttempt = await anon.from("doctor_availability").insert({
    day_of_week: 6,
    start_time: "08:00",
    end_time: "12:00",
  });
  report(
    2,
    "anon cannot write doctor_availability (policy is select-only)",
    !!writeAttempt.error,
    writeAttempt.error?.message ?? "unexpectedly succeeded"
  );

  // ---- Test 3: authenticated doctor behavior unchanged (regression) --------
  const signIn = await anon.auth.signInWithPassword({
    email: "doctor@clinic.local",
    password: "dev-password-only",
  });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`doctor sign-in failed: ${signIn.error?.message}`);
  }
  const doctor = anon;
  const docRead = await doctor
    .from("doctor_availability")
    .select("*")
    .eq("day_of_week", 1)
    .single();
  const docWrite = await doctor
    .from("doctor_availability")
    .update({ end_time: "17:00" })
    .eq("day_of_week", 6)
    .select();
  // Day 6 has no row seeded; a valid doctor UPDATE that matches zero rows is
  // the expected shape — so prove write power on an existing row instead.
  const docWriteReal = await doctor
    .from("doctor_availability")
    .update({ end_time: "17:00" })
    .eq("day_of_week", 1)
    .select();
  report(
    3,
    "authenticated read/write unchanged (regression)",
    !docRead.error &&
      !!docRead.data &&
      !docWriteReal.error &&
      (docWriteReal.data?.length ?? 0) === 1,
    docRead.error?.message ?? docWriteReal.error?.message ?? "read+write OK"
  );
  void docWrite;

  console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(1);
});
