# Phase 1 — Project Scaffold + Database Schema

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Depends on:** Master Handoff doc, Sections 1–11 (settled — not re-derived here)
**Feeds into:** Phase 2 (Auth + role-based access), Phase 3 (Patient booking flow)

---

## 0. Objective

Stand up a working local development environment and the full database schema before any feature logic is written. By the end of this phase:

- `npm run dev` boots a Next.js app that successfully queries a local Supabase Postgres instance running in Docker.
- All Phase 1+ tables exist via committed migration files (not hand-edited through Studio).
- Slot-conflict prevention (FR 3, 3a, 6a) is enforced at the **database** level, not just app logic — this is the one piece of business logic worth baking into the schema now, since two different code paths (online + walk-in) both depend on it.
- Row-Level Security is enabled (empty/default-deny) on every table so Phase 2 adds policies to an already-locked-down schema rather than retrofitting security onto an open one.
- The project-tracking files from Section 10 exist and are committed.

Nothing in this phase touches UI, auth flows, or SMS. Those are later phases.

---

## 1. Project Scaffold

### 1.1 Next.js init

```bash
npx create-next-app@latest clinic-appointment-system \
  --typescript --tailwind --eslint --app \
  --src-dir --import-alias "@/*"
cd clinic-appointment-system
```

Confirm during prompts: App Router (yes), `src/` directory (yes), Turbopack — either is fine, default is okay.

### 1.2 Dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install react-day-picker date-fns
npm install zod
npx shadcn@latest init
npx shadcn@latest add calendar button input label select card badge table
```

- `@supabase/ssr` — cookie-based session handling for Next.js App Router (server components, route handlers, middleware). Needed from Phase 2 onward but installed now so the client helper files below compile.
- `react-day-picker` + shadcn's Calendar wrapper — the decided date-picker (Section 9).
- `zod` — request-body validation for API routes (appointment request payload, patient registration payload).

### 1.3 Supabase local (Docker via CLI — not hosted console)

```bash
npx supabase init
```

This creates `supabase/config.toml` and `supabase/migrations/`. Do **not** run `supabase link` — no hosted project exists for this course build.

```bash
npx supabase start
```

Requires Docker Desktop (or equivalent) running. This pulls and starts the local stack: Postgres, GoTrue (Auth), PostgREST, Realtime, Storage, Kong (API gateway), and Studio. On success it prints:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
```

Local Studio (`54323`) is fine to use for **inspecting** data during development — the constraint from the project brief is that schema changes go through migration files, not that Studio is banned outright.

### 1.4 Environment variables

`.env.local` (gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
```

`.env.local.example` (committed, no real values) should mirror the three keys above so any teammate can `supabase start` and fill it in locally.

### 1.5 Supabase client helpers

```
src/lib/supabase/client.ts    → browser client (anon key)
src/lib/supabase/server.ts    → server component / route handler client (cookie-based)
src/lib/supabase/admin.ts     → service-role client, server-only, for privileged operations (e.g. SMS worker in a later phase)
```

`admin.ts` must never be imported into any file under `src/app/**/page.tsx` or any client component — service-role key bypasses RLS entirely. OpenCode should flag this in the plan if it ever imports admin.ts outside a route handler or server action.

### 1.6 Folder structure (Phase 1 scope only — later phases add to this)

```
clinic-appointment-system/
├── AGENTS.md
├── changelog.md
├── progress.md
├── AI_TOOL_LOG.md
├── .env.local.example
├── specs/
│   └── phase-1-project-scaffold-database-schema.md
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── <timestamp>_phase1_schema.sql
└── src/
    ├── app/
    │   └── page.tsx           (placeholder — "Clinic Appointment System" + a live Supabase connection check)
    └── lib/
        └── supabase/
            ├── client.ts
            ├── server.ts
            └── admin.ts
```

### 1.7 Project-tracking files (Section 10)

Create at repo root, each seeded with a Phase 1 entry:

- **`AGENTS.md`** — persistent OpenCode instructions: update `changelog.md`/`progress.md` after build mode; do not `git commit` under any circumstances (human-gated, see Section 3 below); on test failure, log the attempt in `changelog.md`, retry against the same spec, cap 2 retries, escalate to Claude Chat on a 3rd failure.
- **`changelog.md`** — starts empty except a header; OpenCode appends a "Phase 1" entry after build mode.
- **`progress.md`** — starts with a single row: `Phase 1 — Project Scaffold + DB Schema | Not started`.
- **`AI_TOOL_LOG.md`** — starts with a header row only; populated from `changelog.md`, not hand-written.

---

## 2. Database Schema

All of the following goes into **one** migration file for Phase 1:
`supabase/migrations/<timestamp>_phase1_schema.sql`, created via:

```bash
npx supabase migration new phase1_schema
```

### 2.1 Enums

```sql
create type user_role as enum ('patient', 'doctor', 'receptionist');
create type appointment_status as enum ('PENDING', 'CONFIRMED', 'CANCELLED');
create type attendance_status as enum ('ATTENDED', 'NO_SHOW');
create type appointment_source as enum ('online', 'walk_in');
create type payment_method as enum ('cash', 'gcash');
create type sms_type as enum ('confirmation', 'reminder');
create type sms_status as enum ('sent', 'failed');
```

### 2.2 Tables

**`profiles`** — one row per Supabase Auth user (doctor, receptionist, and any patient who registers online). Walk-in-only patients (registered entirely by the receptionist, never log in) do **not** get a profile row — see `patients.profile_id` below.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);
```

**`patients`** — contact/registration info (FR 1). Decoupled from `profiles` so a walk-in with no account can still have a patient record.

```sql
create table patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  address text,
  created_at timestamptz not null default now()
);

create index idx_patients_phone on patients(phone);
```

`phone` is required (not `email`) — it's the SMS delivery target and the system is SMS-only (Section 11).

**`doctor_availability`** — working hours (FR 7, single doctor — no `doctor_id` column needed per Section 11's scope decision).

```sql
create table doctor_availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int not null default 30,
  is_active boolean not null default true,
  check (start_time < end_time)
);
```

**`appointments`** — the core table (FR 2–6, 8; D2 in the DFD).

```sql
create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete restrict,
  appointment_date date not null,
  appointment_time time not null,
  reason text,
  source appointment_source not null,
  status appointment_status not null default 'PENDING',
  attendance attendance_status,
  payment_reference text,
  payment_method payment_method,
  handled_by uuid references profiles(id), -- receptionist who approved/registered it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_date on appointments(appointment_date);
create index idx_appointments_patient on appointments(patient_id);
```

**Slot-conflict prevention (FR 3, 3a, 6a) — enforced at the DB level:**

```sql
create unique index uq_appointments_slot
  on appointments (appointment_date, appointment_time)
  where status <> 'CANCELLED';
```

A partial unique index, not a plain unique constraint — cancelled appointments must not permanently block a slot from being rebooked. This is what makes 3a ("confirm the first validated submission, reject the later one") and 6a ("walk-ins reuse the same check") hold true even under concurrent inserts: whichever `INSERT` reaches Postgres first wins, the second raises a unique-violation, and the app layer catches that specific error and returns "slot no longer available." This is deliberately a DB-level guarantee, not just an app-level pre-check, because a pre-check-then-insert pattern in application code has a race window that two simultaneous requests can both pass.

`updated_at` auto-touch trigger:

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();
```

**`sms_logs`** — delivery status log (FR 5a: log failures, no auto-retry).

```sql
create table sms_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  type sms_type not null,
  status sms_status not null,
  provider_response text,
  sent_at timestamptz not null default now()
);

create index idx_sms_logs_appointment on sms_logs(appointment_id);
```

### 2.3 Row-Level Security — enabled now, policies deferred to Phase 2

Phase 1 turns RLS **on** with no policies, so the schema is default-deny from the moment it exists rather than briefly open:

```sql
alter table profiles enable row level security;
alter table patients enable row level security;
alter table doctor_availability enable row level security;
alter table appointments enable row level security;
alter table sms_logs enable row level security;
```

With RLS enabled and zero policies, every table is unreadable/unwritable via the anon or authenticated client — only the service-role key can touch them. That's expected and correct for Phase 1; Phase 2's spec will add the per-role policies (patient reads own records, receptionist reads/writes all, doctor reads schedule-relevant data). Flagging this now so it isn't mistaken for a bug when the Phase 1 smoke test (below) needs the service-role client to insert seed data.

### 2.4 Seed data (local dev only)

`supabase/seed.sql` (auto-applied on `supabase db reset`):

```sql
insert into doctor_availability (day_of_week, start_time, end_time, slot_duration_minutes)
values
  (1, '09:00', '17:00', 30), -- Monday
  (2, '09:00', '17:00', 30),
  (3, '09:00', '17:00', 30),
  (4, '09:00', '17:00', 30),
  (5, '09:00', '17:00', 30);
```

Monday–Friday, 9–5, 30-minute slots — a placeholder the real clinic's hours can overwrite later; it exists so Phase 1's smoke test has availability data to check against.

---

## 3. Human-in-the-loop gate for this phase

Per Section 10's workflow: OpenCode build mode applies this spec, updates `changelog.md`/`progress.md` to "Built — awaiting test," and stops — no `git commit`. Before marking this phase tested, manually verify all of Section 4 below, then instruct OpenCode to commit code + `changelog.md` + `progress.md` together.

---

## 4. Test Cases (manual, run after OpenCode build mode)

1. **Docker stack boots** — `npx supabase start` succeeds; `npx supabase status` shows all services running.
2. **Migration applies cleanly** — `npx supabase db reset` runs the Phase 1 migration + seed with no errors, on a fresh container.
3. **Next.js connects** — `npm run dev`, load `localhost:3000`; the placeholder page successfully queries `doctor_availability` (via the service-role client, since no RLS policies exist yet) and renders the 5 seeded rows without a connection error.
4. **RLS default-deny confirmed** — using the **anon** key directly (e.g. via `curl` against the PostgREST endpoint, or Studio's API tester), attempt `select * from patients`; expect an empty result / permission error, not data. This confirms RLS is on and not accidentally left open.
5. **Slot-conflict constraint holds** — via the service-role client or Studio SQL editor, insert two appointments with the same `appointment_date` + `appointment_time` and `status = 'PENDING'`; the second insert must fail with a unique-violation on `uq_appointments_slot`.
6. **Cancelled slots are reusable** — insert an appointment, set its `status` to `'CANCELLED'`, then insert a *new* appointment at that same date/time; this second insert must succeed (proves the partial index correctly excludes cancelled rows).
7. **Walk-in patient without an account** — insert a `patients` row with `profile_id = null`; must succeed (proves walk-ins don't require a `profiles`/auth row).
8. **`updated_at` trigger fires** — update any field on an existing appointment row; `updated_at` must change to a newer timestamp automatically.
9. **Project-tracking files present** — `AGENTS.md`, `changelog.md`, `progress.md`, `AI_TOOL_LOG.md` all exist at repo root and are non-empty/committed.

If any test fails, this is the point where OpenCode's retry policy (Section 10, capped at 2 attempts against this same spec) applies — a schema-level failure here is worth catching before Phase 2 builds auth policies on top of it.

---

## 5. Explicitly deferred to later phases (not gaps — scoped out on purpose)

- RLS policies themselves (Phase 2, alongside Supabase Auth wiring).
- Any UI beyond the one placeholder connectivity-check page.
- Slot-generation logic (turning `doctor_availability` rows into bookable time slots for a given date) — this is application logic for the booking flow phase, not schema.
- Semaphore SMS integration.
- `AGENTS.md`'s exact retry-policy wording can be copied near-verbatim from Section 10 of the Master Handoff; not re-specified in full here to avoid drift between two copies of the same policy.

---

## 6. Handoff notes for OpenCode plan mode

- This is a from-scratch scaffold — there is no existing repo state to reconcile against.
- The one design judgment call worth flagging back to Claude Chat if plan mode disagrees with it: keeping `patients` separate from `profiles` (rather than one merged table) specifically to support account-less walk-ins. If plan mode proposes merging them, that's a divergence to reconcile before build mode runs, per Section 10.
- Everything in Section 2 is one migration file. Do not split it across multiple migrations for Phase 1 — there's no dependency ordering problem that requires it, and one file keeps this phase's diff easy to review against this spec.
