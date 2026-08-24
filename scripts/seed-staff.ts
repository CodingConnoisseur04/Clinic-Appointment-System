import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader so this runs without extra tooling:
//   npx tsx scripts/seed-staff.ts
function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  let file: string;
  try {
    file = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of file.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (!(key in process.env)) process.env[key] = match[2];
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — is .env.local present?"
  );
  process.exit(1);
}

// Local-dev only. Never point this at a non-local project.
if (!url.includes("127.0.0.1")) {
  console.error(`Refusing to run against a non-local URL: ${url}`);
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey);

type StaffSeed = {
  email: string;
  password: string;
  role: "doctor" | "receptionist";
  fullName: string;
  phone: string;
};

const staff: StaffSeed[] = [
  {
    email: "doctor@clinic.local",
    password: "dev-password-only",
    role: "doctor",
    fullName: "Dr. Test",
    phone: "+639170000001",
  },
  {
    email: "receptionist@clinic.local",
    password: "dev-password-only",
    role: "receptionist",
    fullName: "Front Desk Test",
    phone: "+639170000002",
  },
];

async function ensureRole(userId: string, role: string) {
  // Local GoTrue quirk: app_metadata is written AFTER the auth.users INSERT,
  // so handle_new_user() always defaults new users to 'patient'. Set the
  // intended role explicitly via service-role (permitted by
  // trg_prevent_role_change since auth.role() = 'service_role').
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw error;
}

async function seed() {
  for (const person of staff) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      app_metadata: { role: person.role },
      user_metadata: { full_name: person.fullName, phone: person.phone },
    });

    if (error) {
      // Idempotent rerun support: user already exists after a prior seed.
      if (
        error.code === "email_exists" ||
        /already (been )?registered|already exists/i.test(error.message)
      ) {
        const { data: existing } = await admin.auth.admin.listUsers();
        const user = existing?.users.find((u) => u.email === person.email);
        if (!user) throw new Error(`${person.email} exists but not found`);
        await ensureRole(user.id, person.role);
        console.log(
          `- ${person.email}: already exists — role ensured ('${person.role}')`
        );
        continue;
      }
      throw error;
    }

    if (data.user) await ensureRole(data.user.id, person.role);
    console.log(`- ${person.email}: created with role '${person.role}'`);
  }
}

seed()
  .then(() => console.log("Staff seeding done."))
  .catch((e) => {
    console.error("Staff seeding failed:", e.message ?? e);
    process.exit(1);
  });
