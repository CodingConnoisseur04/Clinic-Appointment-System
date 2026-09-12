# Changelog

Record of what was actually built, per phase. Updated at phase closeout,
right before syncing back to Claude Chat for the next phase's planning.
This is the source of truth when it diverges from the spec in /specs/.

---

---

## Phase 1 — Scaffold & schema
**Date closed:** 2026-08-23
**Spec:** /specs/phase-1-project-scaffold-database-schema.md

### What was built
- Next.js 16 (App Router, TypeScript, Tailwind v4, ESLint, `src/` dir,
  `@/*` alias) scaffolded and merged into the repo root.
- Dependencies installed: `@supabase/supabase-js`, `@supabase/ssr`,
  `react-day-picker`, `date-fns`, `zod`, plus `server-only`.
- shadcn/ui initialized (`--defaults` → base-nova/radix preset) with
  calendar, button, input, label, select, card, badge, table components.
- Supabase local stack already initialized + running (config.toml existed
  before this build; project_id = `Clinic_Appointment_System`, Postgres 17).
- `.env.local` (real local keys) + `.env.local.example` (committed template).
- Client helpers: `src/lib/supabase/client.ts` (browser/anon),
  `server.ts` (cookie-based via `@supabase/ssr`),
  `admin.ts` (service-role, guarded by `server-only` import so any
  accidental client-bundle import fails the build).
- Single migration `supabase/migrations/20260823173553_phase1_schema.sql`:
  7 enums, 5 tables (profiles, patients, doctor_availability, appointments,
  sms_logs), indexes, partial unique index `uq_appointments_slot`
  (`where status <> 'CANCELLED'`), `set_updated_at()` trigger, RLS enabled on
  all 5 tables with zero policies (default-deny), plus explicit PostgREST
  grants (see deviations).
- `supabase/seed.sql`: Mon–Fri 09:00–17:00, 30-min slots.
- Placeholder page (`src/app/page.tsx`) showing live Supabase connection +
  the 5 seeded availability rows; queries go through
  `src/app/api/health/route.ts` (admin client) rather than being imported
  into the page directly.
- `git init` performed (repo was not version-controlled); branch renamed to
  `main`. Nothing committed — awaiting human test.

### Deviations from spec
1. **Scaffold location** — spec §1.1's literal command creates a nested
   `clinic-appointment-system/` folder, but the repo root was non-empty
   (AGENTS.md, changelog.md, progress.md, docs/, specs/, supabase/).
   create-next-app refuses non-empty dirs, so the app was scaffolded in a
   temp dir and its files merged into the repo root. Net result matches the
   spec's §1.6 folder structure (tracking files beside `src/`); only the
   intermediate step differs. The scaffold's own generated AGENTS.md /
   CLAUDE.md were discarded in favor of this repo's existing AGENTS.md.
2. **Connectivity check via route handler** — spec self-conflict: §1.5 says
   admin.ts must never be imported into any `page.tsx`, but Test Case 3 wants
   the placeholder page querying via the service-role client (anon is
   RLS-blocked). Resolved per plan-mode agreement: `/api/health` route
   handler uses admin.ts; `page.tsx` fetches it client-side. Both constraints
   hold.
3. **Explicit GRANTs added to migration** — not in spec's SQL. This CLI
   version no longer auto-grants the Data API roles (`anon`,
   `authenticated`, `service_role`) access to new tables
   (`auto_expose_new_tables` unset in config.toml), so even service_role got
   "permission denied" through PostgREST and Test 3 failed initially.
   Added hosted-default grants (`usage` on schema public + `all` on tables/
   sequences for all three roles). RLS still default-denies anon/
   authenticated because zero policies exist — retested after the change.
4. **shadcn init flags differ** — spec shows `npx shadcn@latest init`; the
   current CLI has different flags (`--defaults --yes`, base-nova preset,
   Tailwind v4). Components requested are identical.
5. **Legacy JWT keys used for env** — `supabase start` now prints new-style
   publishable/secret keys by default; `supabase status --output json` still
   exposes the legacy ANON_KEY / SERVICE_ROLE_KEY JWTs, which are what
   `.env.local` uses (matches spec §1.4 naming).

### Files touched
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`,
  `.env.local.example`, `components.json`
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`,
  `src/app/api/health/route.ts`
- `src/lib/utils.ts`, `src/lib/supabase/{client,server,admin}.ts`
- `src/components/ui/{button,calendar,input,label,select,card,badge,table}.tsx`
- `supabase/migrations/20260823173553_phase1_schema.sql`, `supabase/seed.sql`
- `public/*` (create-next-app assets)
- `AI_TOOL_LOG.md` (created), `changelog.md`, `progress.md`

### Test cases (spec §4)
| # | Test | Result |
|---|------|--------|
| 1 | Docker stack boots (`supabase start`) | PASS (was already running; status OK) |
| 2 | Migration applies cleanly (`supabase db reset`) | PASS |
| 3 | Next.js connects, renders 5 seeded rows | PASS (via `/api/health` + service-role) |
| 4 | RLS default-deny via anon key | PASS (PostgREST returns `[]` / permission denied pre-grant-fix) |
| 5 | Slot conflict → unique violation on second insert | PASS (`uq_appointments_slot` raised) |
| 6 | Cancelled slot reusable | PASS |
| 7 | Walk-in patient with `profile_id = null` | PASS |
| 8 | `updated_at` trigger fires | PASS (verified across separate transactions) |
| 9 | Tracking files present at root | PASS (AGENTS.md, changelog.md, progress.md, AI_TOOL_LOG.md) |

Note on Tests 5–8 verification method: run as SQL against the local DB via
`supabase db query` after `db reset`. Test 8 must be verified across separate
transactions — inside a single DO block, `now()` is frozen to transaction
start time, which can produce a false failure.

### Known issues / follow-ups
- `npm run lint` initially failed on auto-generated files under
  `supabase/.temp/**`; these are now excluded in eslint.config.mjs and added
  to .gitignore. No lint/type errors remain.
- Phase numbering discrepancy to reconcile before Phase 2 planning: this
  spec says it feeds "Phase 2 (Auth + role-based access)", but progress.md
  currently lists Phase 2 as "Slot-conflict logic". Not blocking Phase 1.
- `changelog.md`'s old Phase 1 stub referenced `/specs/phase-1-scaffold.md`;
  corrected to the actual filename above.

---

## Phase 2 — Auth + role-based access
**Date closed:** 2026-08-24
**Spec:** /specs/phase-2-auth-role-based-access.md

### What was built
- Migration `supabase/migrations/20260823180000_phase2_auth_rls.sql` (one
  file, per spec): `get_my_role()` security-definer helper,
  `handle_new_user()` + `on_auth_user_created` trigger on `auth.users`
  (role from `raw_app_meta_data`, defaulting `'patient'`),
  `prevent_role_change()` anti-escalation trigger on `profiles`, and all
  RLS policies per spec §2.4 — profiles (own/staff select, own update),
  patients (own/staff select/insert/update, no delete),
  doctor_availability (all-read, doctor-write), appointments (patient
  own-insert constrained to `source='online' AND status='PENDING'`,
  receptionist full read/write, doctor reads `CONFIRMED` only),
  sms_logs (receptionist-select only). No new tables or grants.
- App layer: `src/lib/supabase/middleware.ts` (`updateSession`) +
  `src/middleware.ts` (asset-excluding matcher);
  `src/lib/auth/get-profile.ts` (`getCurrentProfile()`, server-side).
- Tooling: `tsx` devDependency; `scripts/seed-staff.ts` (idempotent local
  staff seeding via service-role admin API); `scripts/test-phase2.ts`
  automated harness for spec Tests 1–13 through real PostgREST paths.

### Deviations from spec
1. **Staff role assignment needed a post-create step** (the significant
   one). Spec §3.3 assumed `handle_new_user()` would pick up
   `app_metadata.role` from `auth.admin.createUser()`. On this local stack
   it does not: GoTrue writes `raw_app_meta_data` *after* the initial
   `auth.users` INSERT (verified empirically — direct SQL insert with the
   role present at INSERT time produces the correct profile role, while
   admin-API-created users always got `'patient'`). Fix:
   `seed-staff.ts` now explicitly updates `profiles.role` via the
   service-role client immediately after creating each staff user.
   Security model unchanged: roles are still only settable through the
   service-role path; public signups still cannot influence role (Tests 1,
   2, 12 pass). The migration's trigger logic is untouched and remains
   correct for any environment where metadata IS present at insert time.
2. **Migration filename timestamp** — `supabase migration new` stamped UTC
   (`101911`), which sorts before Phase 1's locally-generated `173553` and
   would have run first. Renamed to `20260823180000_phase2_auth_rls.sql`.
   Worth knowing for future migrations: use one consistent clock when
   naming files manually.
3. **Test harness committed** (`scripts/test-phase2.ts`) — approved in plan
   mode so the human can rerun all 13 checks after `db reset` + reseed.

### Files touched
- `supabase/migrations/20260823180000_phase2_auth_rls.sql`
- `src/middleware.ts`, `src/lib/supabase/middleware.ts`,
  `src/lib/auth/get-profile.ts`
- `scripts/seed-staff.ts`, `scripts/test-phase2.ts`
- `package.json` (+tsx devDep)
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §4)
| # | Test | Result |
|---|------|--------|
| 1 | Public signup defaults to patient | PASS |
| 2 | Signup cannot self-elevate via user_metadata | PASS |
| 3 | Seeded staff get correct roles | PASS (after deviation #1 fix) |
| 4 | Patient can't read another patient | PASS |
| 5 | Patient inserts own patient + appointment rows | PASS |
| 6 | Patient insert rejected outside constraints | PASS |
| 7 | Patient cannot update/cancel own appointment | PASS |
| 8 | Receptionist full read/write incl. walk-ins | PASS |
| 9 | Doctor sees only CONFIRMED; no writes | PASS |
| 10 | Availability: doctor yes, receptionist no | PASS |
| 11 | sms_logs receptionist-only | PASS |
| 12 | Direct role escalation blocked by trigger | PASS |
| 13 | Middleware OK for signed-out visitor | PASS (HTTP 200) |

Run order for humans: `npx supabase db reset` → `npx tsx
scripts/seed-staff.ts` → `npx tsx scripts/test-phase2.ts` (start `npm run
dev` first if you want Test 13 to hit a live server).

### Known issues / follow-ups
- **Important workflow note:** `db reset` wipes auth users; staff accounts
  must be re-seeded with `npx tsx scripts/seed-staff.ts` afterwards.
- If hosted Supabase is introduced later, re-verify deviation #1 there —
  hosted GoTrue may write app_metadata at insert time (standard documented
  behavior), in which case the seed script's explicit update is harmless
  but redundant.
- progress.md rows 3–7 still carry stale phase names/ordering vs this
  spec's feed-order; left untouched per plan-mode agreement.

---

## Phase 3 — Slot-conflict logic (app layer)
**Date closed:** 2026-08-24
**Spec:** /specs/phase-3-slot-conflict-logic.md

### What was built
- Migration `supabase/migrations/20260824050822_phase3_slot_logic.sql`:
  partial unique index `uq_patients_profile_id` (Addendum A.1) and
  `availability_exceptions` table with RLS + doctor-write/all-read policies
  (Addendum A.3), reusing Phase 2's `get_my_role()`. Timestamp verified to
  sort after Phase 2's file per spec §1.
- `src/lib/booking/get-available-slots.ts` — closed-day short-circuit →
  weekly hours → candidate generation → subtract non-cancelled bookings.
- `src/lib/booking/create-appointment.ts` — typed outcomes; `SLOT_TAKEN`
  from Postgres `23505` / `uq_appointments_slot` match; `CLOSED_DATE`
  pre-check; zod payload validation; `handledBy` required for walk-ins.
  Inserts go through the caller's RLS-bound client only.
- `src/lib/patients/find-or-create-patient.ts` — exact-phone reconciliation,
  walk-in profile-linking path (exercises `uq_patients_profile_id`),
  duplicate-safe fallback when the profile is already linked elsewhere.
  Service-role client per spec §2.3's structural justification.
- Routes, both gated behind any authenticated session (cookie or Bearer):
  `src/app/api/available-slots/route.ts?date=YYYY-MM-DD` (admin-backed,
  spec §2.1.1 resolution) and `src/app/api/patients/find-or-create/route.ts`.
- `src/lib/auth/get-request-user.ts` — shared route auth helper (cookie
  session first, Authorization bearer fallback so scripts/APIs can call).
- `scripts/test-phase3.ts` — harness for spec Tests 1–12 through real
  PostgREST sessions.

### Deviations from spec
1. **Route auth gating added** (approved in plan mode): both new endpoints
   return 401 without a valid session. The spec didn't specify gating;
   AGENTS.md's "no bypassing via service role in client-facing code paths"
   pushed toward locking down service-role-powered routes, especially
   find-or-create (open access would let anyone enumerate phone numbers).
   Slot data itself remains "public as a phone call" in spirit for any
   authenticated user.
2. **GRANTs added for the new table** — spec §5 assumed Phase 1's grants
   covered everything; they only covered tables existing at that time.
   This CLI version grants nothing automatically, so the doctor insert in
   Test 2 initially failed with permission-denied until
   `grant all on availability_exceptions to anon, authenticated,
   service_role` was added to this migration. Rule of thumb going forward:
   every migration creating a table must grant on it explicitly.
3. **Harness mirrors lib functions instead of importing them** — `tsx`
   doesn't resolve the `@/*` alias used by `src/lib/**`, so
   `test-phase3.ts` contains faithful local copies of the three functions
   and tests those plus the live `/api/available-slots` route (which does
   execute the real `src/lib` code). Consequence: the real
   `create-appointment.ts` / `find-or-create-patient.ts` modules are not
   directly executed by the harness — their logic is verified via the
   mirror + the Phase 4/5 UIs will exercise the real modules. Flagging
   honestly rather than claiming more coverage than exists. If a future
   phase wants direct coverage, wiring `tsconfig-paths` into tsx is the fix.
4. **Bearer-token auth support on routes** — part of deviation #1's helper:
   routes accept the SSR cookie session or an `Authorization: Bearer`
   header, enabling non-browser callers (the test harness) without weakening
   the gate.

### Files touched
- `supabase/migrations/20260824050822_phase3_slot_logic.sql`
- `src/lib/booking/{get-available-slots,create-appointment}.ts`,
  `src/lib/patients/find-or-create-patient.ts`
- `src/app/api/available-slots/route.ts`,
  `src/app/api/patients/find-or-create/route.ts`
- `src/lib/auth/get-request-user.ts`
- `scripts/test-phase3.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §3)
| # | Test | Result |
|---|------|--------|
| 1 | `uq_patients_profile_id` holds | PASS |
| 2 | Exceptions RLS matches doctor_availability shape | PASS (after deviation #2) |
| 3 | Slots on normal weekday (16 slots, 09:00–16:30) | PASS |
| 4 | Exception date returns [] | PASS |
| 5 | Booked excluded / cancelled re-included | PASS |
| 6 | Route correct for authenticated patient; anon 401 | PASS |
| 7 | createAppointment online + walk-in succeed | PASS |
| 8 | Concurrent same-slot: one win, typed SLOT_TAKEN | PASS |
| 9 | CLOSED_DATE before insert | PASS |
| 10 | findOrCreatePatient reuses walk-in by phone | PASS |
| 11 | findOrCreatePatient creates when no match | PASS |
| 12 | End-to-end signup → register → book | PASS |

Note: Test 10 initially failed due to a harness setup flaw (linking a
walk-in to a profile that already owned a patients row — the function
correctly returned the already-linked row); fixed in the harness, not the lib.

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
start `npm run dev` → `npx tsx scripts/test-phase3.ts`.

### Known issues / follow-ups
- Real `create-appointment.ts` / `find-or-create-patient.ts` modules are
  exercised first in Phases 4–5 UIs (see deviation #3). Their mirrors in
  the harness must be kept in sync or, better, dropped once tsx path
  aliases are wired up.
- Addendum A treated as signed off per human confirmation ("i am the only
  team") recorded during plan mode.

---

## Phase 4 — Receptionist flow
**Date closed:** 2026-08-24
**Spec:** /specs/phase-4-receptionist-flow.md

### What was built
- Shared auth UI (reused by Phases 5/6): `src/app/login/page.tsx`
  (email/password, inline generic error, post-login redirect by role from
  `profiles.role`), `src/lib/auth/require-role.ts` (no session → `/login`,
  wrong role → their own role home, returns profile),
  `src/app/receptionist/layout.tsx` wrapping all `/receptionist` routes.
- `create-appointment.ts` extended additively with optional
  `status` / `paymentMethod` / `paymentReference`; defaults preserve Phase
  3 behavior exactly (verified by Test 6 = Phase 3 suite unmodified).
- New `src/lib/booking/update-appointment.ts`: `confirmAppointment`,
  `rejectAppointment`, `markAttendance` — caller's RLS-bound client only,
  no in-function role checks per spec §2.2. Each update scopes to its
  intended starting status (confirm → PENDING, attendance → CONFIRMED) and
  reports typed failure when zero rows match.
- Receptionist dashboard `src/app/receptionist/page.tsx`: one page, three
  tabs (Pending Requests / Walk-in Registration / Appointments). Reads and
  writes go through the receptionist's browser client (RLS-bound); slot
  lookup + patient reconciliation reuse Phase 3's service-role API routes
  as-is. Confirm dialog carries the "no SMS sent" note required by spec §5.
  shadcn tabs/dialog/textarea/sonner added; Toaster wired into root layout.
- `scripts/test-phase4.ts` — imports the REAL src/lib modules.

### Deviations from spec
1. **Phase 3's harness-mirror gap is closed** (spec §6 hoped for this):
   probing showed current tsx resolves the `@/*` alias natively — Phase 3's
   assumption was simply outdated. `test-phase4.ts` imports
   `create-appointment.ts` / `update-appointment.ts` directly; no new
   mirrors were added. (Phase 3's own harness left untouched, as scoped.)
2. **Status-precondition scoping added to update functions** (flagged in
   plan mode): confirm only matches PENDING rows, attendance only
   CONFIRMED rows. Beyond the spec's literal text but prevents confirming
   a CANCELLED row; RLS remains the authority either way.
3. **Walk-in form prefills via a direct staff-scoped query** on `patients`
   (allowed by `patients_select_staff`) rather than extending the
   find-or-create route's response shape — the route stays exactly as Phase
   3 shipped it and remains the authoritative reconciliation step on submit.
4. **Harness requires a fresh `db reset` before reruns** — fixed test
   slots collide with rows from a prior run otherwise (same implicit
   contract as the Phase 3 harness).

### Files touched
- `src/app/login/page.tsx`, `src/app/receptionist/layout.tsx`,
  `src/app/receptionist/page.tsx`, `src/app/layout.tsx` (Toaster)
- `src/lib/auth/require-role.ts`,
  `src/lib/booking/create-appointment.ts` (extended),
  `src/lib/booking/update-appointment.ts`
- `src/components/ui/{tabs,dialog,textarea,sonner}.tsx` (shadcn)
- `package.json` (+ sonner dep via shadcn)
- `scripts/test-phase4.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §4)
| # | Test | Result |
|---|------|--------|
| 1 | confirmAppointment sets CONFIRMED + both payment fields | PASS |
| 2 | rejectAppointment sets CANCELLED | PASS |
| 3 | markAttendance ATTENDED / NO_SHOW | PASS |
| 4 | One-call CONFIRMED creation with payment fields | PASS |
| 5 | Patient session denied on all three updates (RLS) | PASS (NOT_FOUND_OR_DENIED ×3) |
| 6 | Phase 3 suite passes unmodified | PASS (12/12) |

Manual browser tests 7–11 remain for the human (login redirect, walk-in
flow through the real form, pending-tab end-to-end, appointments tab).

Smoke-checked during build: anonymous GET `/receptionist` redirects to the
login page; `/login` renders. Lint + tsc clean.

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
`npx tsx scripts/test-phase4.ts` (fresh reset required — see deviation #4).

### Known issues / follow-ups
- Phase 3's harness still uses mirrors; could now be trivially rewired to
  import real modules since tsx resolves aliases (left as-is per scope).
- No live updates on the dashboard — refresh after actions is explicit;
  fine per spec §3.3's "reflect immediately (or after a refresh)".
- Patient home (`/patient`) doesn't exist yet — a logged-in patient
  visiting `/receptionist` redirects there and will 404 until Phase 5.

---

## Phase 5 — Patient booking flow
**Date closed:** 2026-08-24
**Spec:** /specs/phase-5-patient-booking-flow.md

### What was built
- §1 prerequisite verified before any code: `config.toml`
  `[auth.email] enable_confirmations = false` — local signups return an
  active session immediately; no config change needed.
- `src/app/signup/page.tsx`: email/password/full name/phone with client-side
  zod validation (phone: optional +, 10–15 digits); `signUp()` puts name/
  phone in `user_metadata` ONLY — no role field anywhere in the form or
  payload, per Phase 2's security model; redirect to `/patient` on success.
- Login page now links to `/signup` (replaces the "arrives later" note).
- `src/app/patient/layout.tsx` — `requireRole(['patient'])`; resolves
  Phase 4's known `/patient` 404.
- `src/app/patient/page.tsx`, two stacked sections:
  - Book an Appointment: shared `<SlotPicker>` → contact details prefilled
    from the patient's own `profiles` row (editable) → optional reason →
    submit via `/api/patients/find-or-create` (own `profileId`) then
    `createAppointment(source:'online')` on Phase 3 defaults only.
    Success message uses Addendum A.2's exact framing ("staff will contact
    you…"); SLOT_TAKEN shows a friendly message and refreshes slots via a
    `refreshKey` bump — never a raw error surface.
  - My Appointments: read-only own-row list through the patient session,
    showing payment method/reference on CONFIRMED rows. No cancel/reschedule
    anywhere, per spec §6.
- `src/components/booking/slot-picker.tsx` — shared date→slots→select
  component fetching Phase 3's `/api/available-slots`. Both call sites use
  it: the new patient form AND the Phase 4 walk-in form were retrofitted
  onto it (its inline fetch/state removed).
- `scripts/test-phase5.ts` — real modules, real sessions, Tests 1–5.

### Deviations from spec
1. **SlotPicker retrofit of the receptionist form was done** (spec §3.2
   called it optional): it was a clean swap, so both booking surfaces now
   share one slot-fetching implementation instead of drifting. Phase 4's
   automated suite was rerun as regression afterwards and passes unmodified.
2. One internal accommodation for Next.js 16's stricter
   `react-hooks/set-state-in-effect` lint rule: SlotPicker defers its fetch
   one tick (`setTimeout(0)`) so no setState fires synchronously inside the
   effect body. Behavior is unchanged.

### Files touched
- `src/app/signup/page.tsx`, `src/app/login/page.tsx`,
  `src/app/patient/layout.tsx`, `src/app/patient/page.tsx`
- `src/components/booking/slot-picker.tsx`
- `src/app/receptionist/page.tsx` (SlotPicker retrofit)
- `scripts/test-phase5.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §4)
| # | Test | Result |
|---|------|--------|
| 1 | Fresh signup → findOrCreatePatient creates patients row | PASS (first real non-mirrored run of this path) |
| 2 | Online request defaults to PENDING | PASS |
| 3 | Second booking reuses same patients row | PASS (rows=1, sameId=true) |
| 4 | Patient A cannot see Patient B's appointments | PASS |
| 5 | Concurrent same-slot → typed SLOT_TAKEN | PASS |

Regression: full Phase 4 suite (5/5) + full Phase 3 suite (12/12) pass
unmodified after the SlotPicker refactor. Smoke-checked during build:
`/signup` renders; anonymous `/patient` redirects to login. Lint + tsc clean.

Manual browser tests 6–9 remain for the human — Test 8 (book as patient →
confirm as receptionist → see CONFIRMED back on the patient dashboard) is
the first full-stack round-trip of the whole system.

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
start `npm run dev` → `npx tsx scripts/test-phase5.ts`.

### Known issues / follow-ups
- None new. Carried context: staff re-seed required after every `db reset`.

---

## Phase 6 — Doctor schedule view & availability management
**Date closed:** 2026-08-24
**Spec:** /specs/phase-6-doctor-schedule-availability.md

### What was built
- Pre-build check per spec §6: verified Phase 2's actual
  `appointments_select_doctor` policy text in the committed migration —
  CONFIRMED-only, unscoped by patient. The spec's "no admin.ts route"
  reasoning holds; `getSchedule` runs on the caller's own session.
- `src/lib/schedule/get-schedule.ts` — confirmed appointments joined to
  patients for a `{from, to}` date range, via the caller's RLS-bound client.
- `src/lib/availability/update-hours.ts` — updates one
  `doctor_availability` row; returns non-blocking
  `conflictingAppointments` count (confirmed appts on that weekday now
  outside the active window); rejects start>=end when active.
- `src/lib/availability/manage-exceptions.ts` — `addException`
  (conflict count for the date + typed ALREADY_CLOSED mapping of the
  unique-violation) and `removeException` (zero-rows → NOT_FOUND_OR_DENIED).
- `/doctor`: layout with `requireRole(['doctor'])` (third use) + one page,
  two tabs — Schedule (Today/This Week toggle, read-only table, zero action
  buttons) and Manage Availability (inline-editable weekly hours with save,
  closed-dates list with reopen, add-closure form). Conflict counts surface
  as sonner warnings, never blocking dialogs.
- shadcn `switch` component added (first use).
- `scripts/test-phase6.ts` — real modules/sessions, Tests 1–6.

### Deviations from spec
1. **Test 2's "rejected by RLS" reframed as scope-correctness** (flagged in
   plan mode): a receptionist session has full appointment read access BY
   Phase 2 design, so literal rejection is impossible. The harness asserts
   what the guarantee actually is — receptionist sees ≥ doctor's view;
   patient's result set exactly equals their own rows (both statuses). My
   first assertion ("patient sees 0 rows") was wrong and the system right:
   the patient's own PENDING row is visible to them; fixed the harness.
2. **updateWorkingHours gained an explicit zero-rows check** before testing
   revealed its necessity: supabase-js reports an RLS-denied UPDATE as
   success-with-zero-rows, so without it Test 3's denial assertions would
   false-pass. Same pattern Phase 4's update functions already used.
3. Harness is reset-required like Phases 3–5's (fixed fixture dates).

### Files touched
- `src/app/doctor/layout.tsx`, `src/app/doctor/page.tsx`
- `src/lib/schedule/get-schedule.ts`,
  `src/lib/availability/{update-hours,manage-exceptions}.ts`
- `src/components/ui/switch.tsx` (shadcn)
- `scripts/test-phase6.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §4)
| # | Test | Result |
|---|------|--------|
| 1 | getSchedule CONFIRMED-only in range, patient joined | PASS |
| 2 | Scope-correctness for rec/patient sessions | PASS (reframed per deviation #1) |
| 3 | updateWorkingHours doctor yes / rec+pat denied | PASS |
| 4 | add/remove exceptions doctor yes / rec+pat denied | PASS |
| 5 | Doctor closure → getAvailableSlots returns [] | PASS (cross-phase write→read loop closed) |
| 6 | conflictingAppointments count reported; writes proceed | PASS (with=1, without=0) |

Regression: Phase 4 suite 5/5 and Phase 5 suite 5/5 pass unmodified after
this phase's changes. Smoke-checked during build: anonymous `/doctor`
redirects to login. Lint + tsc clean.

Manual browser tests 7–12 remain for the human (landing on `/doctor`,
schedule tab vs Phase 5's confirmed booking, editing hours persistently,
closure → empty slot list on booking forms, conflict warning toast, role
guard both directions).

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
start `npm run dev` → `npx tsx scripts/test-phase6.ts`.

### Known issues / follow-ups
- None new. Carried context: staff re-seed required after every `db reset`.
- Known gap carried per spec §5: closures/hours changes never cancel or move
  existing bookings; the warning count is visibility only.
- No live updates; tab data refreshes via explicit reloads/actions only.

---

## Phase 7 — Semaphore SMS
**Date closed:** 2026-08-25
**Spec:** /specs/phase-7-semaphore-sms.md

### What was built
- §0.1 reversal accepted (no objection): reminder trigger is the gated HTTP
  route `/api/cron/send-reminders`, not pg_cron/pg_net/Edge Functions.
- `.env.local.example` += `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`,
  `SEMAPHORE_DRY_RUN=true` (committed default, stays true after closeout),
  `CRON_SECRET`; local values in `.env.local`.
- Migration `20260825012145_phase7_sms_insert_policy.sql` — single policy
  `sms_logs_insert_receptionist` (timestamp verified > Phase 3's; grants
  already covered by Phase 1).
- `src/lib/sms/send-sms.ts` — Semaphore v4 POST; dry-run short-circuits
  BEFORE any network I/O and returns synthetic success; injectable
  `fetchImpl` so the harness can prove zero network calls.
- `src/lib/sms/send-confirmation.ts` — caller-session client, one correctly
  typed `sms_logs` row per attempt regardless of outcome, never throws
  (FR5a); optional `simulateFailure` flag drives Test 4.
- `/api/cron/send-reminders` — 401 unless `Bearer CRON_SECRET`; admin client
  (first genuinely session-less case per spec §7); ±12h window around
  now+24h computed precisely on date+time; summary counts only.
- Phase 4 confirm dialog: "no SMS" note removed (confirm dialog now says an
  SMS goes out automatically; cancel dialog reworded to "patient is not
  notified automatically — call them"); on confirm success it calls the new
  route and toasts sent/failed non-blockingly.
- `scripts/test-phase7.ts` — dry-run only; hard-exits if SEMAPHORE_DRY_RUN
  isn't true.

### Deviations from spec
1. **Confirmation SMS goes through a new route, not direct lib import from
   the dialog** (spec §3.2 implied calling `sendConfirmationSms` from the UI
   with the receptionist's client). The confirm dialog is a CLIENT component;
   importing the lib there would bundle send-sms.ts into browser code where
   `SEMAPHORE_API_KEY` correctly doesn't exist — real sends could never work.
   Fix: `POST /api/sms/send-confirmation`, auth-gated via cookie session,
   builds the receptionist's own RLS-bound server client and calls the same
   lib function. The spec's security intent (receptionist session + RLS
   insert policy) is fully preserved; only the transport changed. Surfaced
   by Test 1's infrastructure before it could become a silent production bug.
2. **`server-only` guard intentionally NOT added to the sms lib modules** so
   the harness can import them directly; safety comes from the route gate +
   non-public env vars instead (commented in-code).
3. Reminder window implemented as **±12h around now+24h** (approved plan
   default), SQL pre-filter widened by a day then filtered precisely on
   date+time in JS.
4. **Post-manual-test fix: find-or-create no longer trusts body-supplied
   profileId** (human-reported failure during browser testing). Root cause:
   two accounts' sessions in one browser (shared per-origin storage) — a
   doctor login overwrote the patient session mid-flow, so the booking insert
   correctly hit RLS as the wrong role. Diagnosis confirmed policies were
   fine; but the incident exposed that `/api/patients/find-or-create`
   accepted any caller-supplied `profileId`. Fixes:
   - route now returns 403 when a non-receptionist caller supplies a
     `profileId` other than their own uid;
   - patient booking form re-verifies `getUser()` matches the loaded profile
     before submitting and reloads on drift;
   - harness Tests 7–8 added as regression (foreign-profileId 403; doctor
     session cannot book).
5. **Operational note for the human:** after every `db reset`, browser-held
   sessions are dead — sign out (or use a fresh incognito context) before
   testing to avoid dual/stale-session confusion. One account per browser
   context; incognito or a separate browser gives clean isolation.

### Files touched
- `supabase/migrations/20260825012145_phase7_sms_insert_policy.sql`
- `src/lib/sms/{send-sms,send-confirmation}.ts`
- `src/app/api/cron/send-reminders/route.ts`
- `src/app/api/sms/send-confirmation/route.ts`
- `src/app/receptionist/page.tsx` (dialog copy + SMS step)
- `.env.local.example`, `.env.local` (local only)
- `scripts/test-phase7.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §5)
| # | Test | Result |
|---|------|--------|
| 1 | Dry-run sendSms succeeds with zero network calls | PASS (spy fetch never invoked) |
| 2 | Confirmation logs correctly-typed row via receptionist session | PASS |
| 3 | sms_logs insert denied for patient/doctor sessions | PASS |
| 4 | Failure path logs 'failed', never throws | PASS |
| 5 | Reminder route 401 without secret | PASS |
| 6 | Only ~24h-out appointment reminded (dry-run) | PASS |
| 7 | find-or-create rejects foreign profileId (403) | PASS (fix regression, deviation #4) |
| 8 | Doctor session cannot book via createAppointment | PASS (fix regression, deviation #4) |

Regression: Phase 4 suite 5/5 unmodified. Lint + tsc clean.

Manual tests remain for the human: Test 7 (the ONE deliberate real-credit
send — flip DRY_RUN=false with a real key + your own phone number, then flip
back) and Test 8 (curl the reminder route with CRON_SECRET).

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
start `npm run dev` → `npx tsx scripts/test-phase7.ts`.

### Known issues / follow-ups
- Scheduling `/api/cron/send-reminders` is Phase 9's job (vercel.json or
  host cron); until then reminders fire only when manually curl'd.
- If a confirmation is retried (dialog used twice), each attempt logs its own
  sms_logs row — acceptable at this scale, worth remembering when Phase 8
  reports on this table.
- `.env.local` was restored to `SEMAPHORE_DRY_RUN=true` after the human's
  manual real-send test (Test 7).

---

## Phase 8 — Reports
**Date closed:** 2026-08-25
**Spec:** /specs/phase-8-reports.md

### What was built
- `src/lib/reports/get-no-show-report.ts` — past CONFIRMED appointments in
  range split into attended / noShowMarked / noShowInferred (NULL attendance
  counted as no-show at query time per Addendum A.5 option (b)) + rate %.
  Strictly read-only — nothing touches the attendance column.
- `src/lib/reports/get-sms-report.ts` — sms_logs grouped by type × status.
- `src/lib/reports/get-appointment-summary.ts` — status and source counts,
  range applied to `created_at`.
- Fourth **Reports** tab on the receptionist dashboard: shadcn Calendar in
  `mode="range"` defaulting to the last 30 days, three plain-number cards
  (marked-vs-inferred shown distinctly per spec §1.1). No charting library,
  no exports, no new routes/policies/tables.
- `scripts/test-phase8.ts` — seeds entirely through real lib functions
  (`createAppointment`, `markAttendance`, `sendConfirmationSms` with
  `simulateFailure`), Tests 1–4.

### Deviations from spec
1. **Test 4's no-show assertion reflects a scope coincidence, stated
   openly** (flagged in plan mode): the doctor's CONFIRMED-only RLS scope is
   exactly what the no-show report queries, so a doctor session legitimately
   produces numbers identical to the receptionist's — asserting
   "incomplete" there would be false. Harness instead asserts: doctor SMS
   report all zeros (no policy at all), doctor no-show matches
   receptionist's, patient totals ≤ receptionist's. The UI exposure gap the
   spec actually cares about holds regardless — only the receptionist
   dashboard renders any of this.

### Files touched
- `src/lib/reports/{get-no-show-report,get-sms-report,get-appointment-summary}.ts`
- `src/app/receptionist/page.tsx` (fourth tab)
- `scripts/test-phase8.ts`
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §3)
| # | Test | Result |
|---|------|--------|
| 1 | No-show splits correct; future excluded; rate right | PASS (1/1/1, total=3, rate=67%) |
| 2 | SMS report counts match seeded mix | PASS |
| 3 | Appointment summary counts match seeded mix | PASS |
| 4 | Scope-correctness for doctor/patient sessions | PASS (per deviation #1) |

Regression: Phase 7 suite 8/8 unmodified. Lint + tsc clean.

Manual browser tests 5–7 remain for the human (Reports tab against
accumulated real data, date-range change updates, role isolation).

Run order: `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
start `npm run dev` → `npx tsx scripts/test-phase8.ts`.

### Known issues / follow-ups
- Reports read `created_at` for the summary (spec §1.3's "created, not
  necessarily scheduled") but `sent_at` for SMS and `appointment_date` for
  no-shows — three different time axes by design; keep in mind when
  comparing cards across an odd range boundary.
- All feature phases complete. Phase 9 (deployment) is the last spec.

---

## Phase 9 — Landing page, branding & logout
**Date closed:**
**Spec:** /specs/phase-9-landing-branding-logout.md

### What was built
- `src/lib/brand.ts` — single source of truth for clinic identity (name,
  tagline, doctor, address, services, clearly-marked sample phone).
  `layout.tsx` metadata now uses it.
- Migration `20260826082101_phase9_landing.sql` — the project's first
  `to anon` policy (`availability_select_anon`, select-only). Reasoning
  verified per spec §2.1; no write access granted.
- `src/app/page.tsx` replaced entirely: public landing page for Golden
  Friendship Family Clinic — hero with Log In / Sign Up, services, doctor
  bio, **live hours from `doctor_availability`** (grouped into day-ranges,
  e.g. "Mon–Fri · 9:00 AM – 5:00 PM", closed days shown), location slip with
  sample phone marked as such. Built as an async server component — no API
  route needed once anon read exists.
- Login/signup: back-to-home link + clinic name in the card header.
- `src/components/dashboard-header.tsx` — shared header on all three role
  layouts (clinic name, user identity, working Sign Out with in-flight
  label). `requireRole()` untouched.
- Light branding: golden-amber primary/ring via shadcn CSS variables
  (light + dark modes), themed `::selection` and caret color,
  `touch-action: manipulation`, `theme-color` meta, `color-scheme: light`.
- SMS confirmation template now names the clinic.
- Mobile-first pass (Playwright at 375px, priority order per §4B): all
  receptionist/doctor/patient tables got horizontal scroll containers; the
  receptionist tab strip now wraps (it was overflowing and leaving a dead
  white strip); doctor schedule card header stacks on mobile; duplicate
  role badge removed from patient page.

### Deviations from spec
1. **Landing composition chosen via the Impeccable concept round** (per
   §4A's skill mandate): `concept-seed` dealt three structures; the human
   locked "Neighborhood Bulletin Board" (pinned notices on a warm board).
   Direction contract comment embedded in `page.tsx`; code-led build (no
   image tooling in this environment).
2. **Font bug fixed app-wide, not just on new pages:** `globals.css` mapped
   `--font-sans` to a variable name `next/font` never emitted, so the whole
   app had been silently rendering in a serif fallback since Phase 1. Fixed
   the mapping; every surface now renders Geist Sans. Surfaced by the first
   screenshot inspection — exactly the "browser surfaces you didn't draw"
   class of defect the craft floor warns about.
3. **A kicker line above the landing h1 was built, caught, and removed** in
   the fix batch — it's a hard ban in the craft floor.
4. **Test 2 of the Phase 8 suite failed once during regression** — cause was
   running it after the Phase 7 suite on the same DB state (SMS counts
   doubled); the suite is documented reset-required. Not a product bug.

### Files touched
- `src/lib/brand.ts`, `src/lib/sms/send-confirmation.ts`
- `supabase/migrations/20260826082101_phase9_landing.sql`
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
- `src/app/login/page.tsx`, `src/app/signup/page.tsx`
- `src/components/dashboard-header.tsx`
- `src/app/{patient,receptionist,doctor}/layout.tsx`
- `src/app/{patient,receptionist,doctor}/page.tsx` (mobile fix pass)
- `scripts/test-phase9.ts`
- `PRODUCT.md` (new — Impeccable init, brand name recorded)
- `changelog.md`, `progress.md`, `AI_TOOL_LOG.md`

### Test cases (spec §5)
| # | Test | Result |
|---|------|--------|
| 1 | anon reads doctor_availability | PASS (5 rows) |
| 2 | anon cannot write it | PASS (RLS violation) |
| 3 | authenticated read/write unchanged | PASS |
| 4–8, 9–10 | manual browser + skill passes | see below |
| 11–13 | 375px checks | PASS after fix batch (automated via Playwright) |

Automated: Phase 9 harness 3/3; Phase 7 suite 8/8; Phase 8 suite 4/4 (after
its documented reset); lint + tsc clean; Impeccable detector: zero findings.
Web Interface Guidelines applied to login/signup/header (name/autocomplete/
spellcheck/inputmode attributes, touch-action, theme-color, color-scheme).

Manual items still open for the human: Test 7 (real SMS showing clinic
name), Test 10 (subjective critique rounds if desired), and a final eyeball
of the landing page at 375px in a real phone browser.

### Known issues / follow-ups
- Deployment spec must land as `specs/phase-10-deployment.md` (renumbered
  per this spec's header); progress.md Current focus already notes it.
- Sample phone number on the landing page is illustrative only — replace if
  a real line ever exists.
- The old serif-fallback bug means all pre-Phase-9 screenshots showed
  non-Geist type; nothing to do, just context for anyone comparing old
  captures.

---

## Sidebar navigation refactor
**Date:** 2026-08-28
**Branch:** feat/sidebar-navigation

### What was built
- **Shared sidebar component** (`src/components/nav/sidebar-nav.tsx`) —
  role-aware navigation using shadcn Sidebar primitives. Shows clinic
  name, role label, and nav items with active-state highlighting.
- **All three role dashboards refactored** to use sidebar navigation:
  - Receptionist: 4 routes (Pending, Walk-in, Appointments, Reports)
  - Doctor: 2 routes (Schedule, Availability)
  - Patient: 2 routes (Book, My Appointments)
- **Shared appointments hook** (`src/hooks/use-appointments.ts`) —
  reusable data-fetching for the receptionist's appointment-dependent pages.
- **Providers wrapper** (`src/components/providers.tsx`) — TooltipProvider
  added to root layout for sidebar tooltip support.
- **DashboardHeader updated** — SidebarTrigger added for mobile hamburger
  toggle.
- Old monolithic pages converted to redirects to the first sub-route.

### Files touched
- `src/components/nav/sidebar-nav.tsx` (new)
- `src/components/providers.tsx` (new)
- `src/components/dashboard-header.tsx` (SidebarTrigger)
- `src/hooks/use-appointments.ts` (new)
- `src/app/layout.tsx` (Providers wrapper)
- `src/app/receptionist/layout.tsx` (SidebarProvider)
- `src/app/receptionist/page.tsx` (redirect)
- `src/app/receptionist/{pending,walk-in,appointments,reports}/page.tsx` (new)
- `src/app/doctor/layout.tsx` (SidebarProvider)
- `src/app/doctor/page.tsx` (redirect)
- `src/app/doctor/{schedule,availability}/page.tsx` (new)
- `src/app/patient/layout.tsx` (SidebarProvider)
- `src/app/patient/page.tsx` (redirect)
- `src/app/patient/{book,appointments}/page.tsx` (new)

### Deviations from spec
None — ad-hoc improvement outside any phase spec.

### Lint fixes
- `src/hooks/use-mobile.ts` — rewritten to avoid setState-in-effect lint
  error (shadcn auto-generated hook). Initial state now uses a synchronous
  function initializer instead of a setState call inside useEffect.
- `src/app/doctor/schedule/page.tsx` — removed redundant setLoading(true)
  inside effect.
- `src/app/receptionist/pending/page.tsx` — removed unused imports.
## Uncommitted patch — Receptionist UX improvements
**Date:** 2026-08-28
**Branch:** feat/receptionist-improvements

### What was built
1. **Completed badge replaces attendance buttons** — Once an appointment's
   attendance is marked (ATTENDED or NO_SHOW), the Attended/No-show buttons
   disappear and a "Completed" badge is shown instead. The Cancel button is
   also hidden for completed appointments.
2. **Past-date blocking in SlotPicker** — The shared `<Calendar>` in
   `SlotPicker` now receives `disabled={{ before: new Date() }}`, preventing
   selection of past dates in both the walk-in registration form and the
   patient booking form.
3. **Sort by time** — Appointments are always sorted by time ascending
   (default order from the database query). Sort toggle removed per user
   request.
4. **12-hour time format** — All user-facing time displays now show
   "2:30 PM" instead of "14:30". A shared `formatTime12h` utility in
   `src/lib/utils.ts` is used across receptionist, patient, doctor pages,
   and SMS messages.
5. **Today's past time slots filtered** — When the selected date is today,
   time slots that have already passed are hidden from the SlotPicker.
   Applies to both the walk-in form and patient booking form. Slot buttons
   also display 12-hour format.

### Files touched
- `src/lib/utils.ts` — added `formatTime12h()`
- `src/components/booking/slot-picker.tsx` — added `disabled` prop to Calendar
- `src/app/receptionist/page.tsx` — Completed badge logic, sort toggle state,
  renamed "Attendance" column to "Completion", hidden Cancel for completed rows
- `src/app/patient/page.tsx` — 12h time format in table + booking summary
- `src/app/doctor/page.tsx` — 12h time format in schedule table
- `src/lib/sms/send-confirmation.ts` — 12h time in confirmation SMS
- `src/app/api/cron/send-reminders/route.ts` — 12h time in reminder SMS
- `src/components/booking/slot-picker.tsx` — filter past slots for today, 12h button labels

### Deviations from spec
None — these are ad-hoc improvements outside any phase spec.

### Known issues / follow-ups
- The `disabled={{ before: new Date() }}` blocks the entire calendar day;
  a user cannot book a same-day afternoon slot if the calendar "today" is
  disabled. If same-day booking should remain possible, the disable needs
  to be date-only (not datetime). Currently the date part of today is
  allowed (react-day-picker's `before` is date-granular, not
  datetime-granular), so this is fine — same-day slots remain bookable.

---

## Receptionist enhancements — home page, CSV reports, settings, dynamic phone
**Date:** 2026-08-29
**Branch:** feature/receptionist-enhancements (merged to main)

### What was built
1. **Home page** (`/receptionist`) — replaced the redirect to `/pending` with
   a real dashboard showing:
   - Today + tomorrow appointment cards in a 2-column grid (patient name,
     time in 12h format, status badge, source, reason)
   - Pending request count widget with a "Review" link to `/pending`
   - Receptionist contact phone number card (read from `clinic_settings`)
2. **Settings page** (`/receptionist/settings`) — receptionist can configure
   the clinic phone number. Stored in a new `clinic_settings` table
   (key-value). Phone type input with `tel` inputmode.
3. **CSV download on reports** — "Download CSV" button fetches all
   appointments in the selected date range and generates a downloadable CSV
   file (patient name, phone, source, status, reason, attendance, payment).
4. **Dynamic clinic phone** — landing page (`/`) and receptionist home page
   both read the phone number from `clinic_settings` instead of the
   hardcoded `CLINIC.phone` in `brand.ts`. `export const dynamic =
   "force-dynamic"` on the landing page to disable server-component caching.
5. **Sidebar nav updated** — added "Home" and "Settings" links to the
   receptionist sidebar.

### Database changes
- New migration `20260829000000_clinic_settings.sql`:
  - `clinic_settings` table (key TEXT PK, value TEXT NOT NULL)
  - Seeded with `receptionist_phone: "(088) 000-0000"`
  - RLS enabled: anon SELECT, authenticated SELECT, receptionist INSERT/
    UPDATE/DELETE (via `get_my_role()`)
  - Explicit GRANTs for `anon` (SELECT) and `authenticated` (CRUD)

### Files touched
- `supabase/migrations/20260829000000_clinic_settings.sql` (new)
- `src/lib/clinic-settings.ts` (new — `getClinicSettings`, `upsertClinicSetting`)
- `src/lib/reports/download-csv.ts` (new — CSV generation)
- `src/app/receptionist/page.tsx` (rewritten — home dashboard)
- `src/app/receptionist/settings/page.tsx` (new)
- `src/app/receptionist/reports/page.tsx` (CSV download card added)
- `src/app/page.tsx` (phone from DB, `dynamic = "force-dynamic"`)
- `src/components/nav/sidebar-nav.tsx` (Home + Settings links)

### Deviations from spec
None — ad-hoc improvement outside any phase spec.

### Web Interface Guidelines review
Applied to all new/changed files. Fixes made:
- `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`, `name` on phone input
- `aria-hidden="true"` on decorative icons (ClipboardList, Phone, Download)
- Title Case for button labels ("Save Settings", "Pending Requests")
- `text-wrap: balance` on section headings

### Known issues / follow-ups
- `db reset` wipes auth users; re-seed with `npx tsx scripts/seed-staff.ts`
- `CLINIC.phone` in `brand.ts` is now unused by the app but still exists;
  can be removed in a future cleanup.

---

## Design revamp — "Warm Confidence" visual world
**Date:** 2026-08-29
**Branch:** design-revamp

### What was built

Full visual redesign of every page and the design system, replacing the
incumbent look with a bold, distinctive "Warm Confidence" direction.

**Design system:**
- New color palette: deep forest green primary (#1a5c3a), warm gold accent
  (#b8860b), warm cream background (#faf8f2), warm white cards, warm stone
  secondaries
- New typography: DM Serif Display for headings (personality + warmth),
  Geist for body (clarity), Geist Mono for code/data
- Updated CSS variables (light + dark modes) for all shadcn tokens
- New utility classes: `.shadow-warm`, `.shadow-warm-lg`, `.page-enter`,
  `.pin-notice`
- Gold accent color added as `--gold` token

**Landing page:**
- Kept community board concept, pushed into bolder direction
- Gold pin accents replace primary-colored pins
- DM Serif Display headings
- Warm shadows (`.shadow-warm-lg` on board, `.shadow-warm` on notices)
- Rounded-xl on cards (up from rounded-lg)

**Auth pages (login, signup):**
- Warm cream background (`var(--background)`) replaces `bg-zinc-50`
- Centered card with `shadow-warm`
- DM Serif Display heading ("Welcome back" / "Create your account")
- Forest green primary button with `w-full`
- Gold hover state on links
- Page-enter animation
- Placeholders added for better form UX

**Dashboard shell:**
- Sidebar: gold logo accent (replaces primary), DM Serif Display for
  clinic name, role label with reduced opacity
- Header: backdrop-blur-sm, gold dot accent, LogOut icon, ghost sign-out
  button
- Layouts: page-enter animation on content area

**Receptionist pages:**
- Home: gold accent on phone icon, warm shadows, arrow icon on Review button
- Pending: warm card shadows, payment reference placeholder
- Walk-in: numbered step indicators (1/2/3) with green/gold accent circles,
  full-width Book & confirm button
- Appointments: warm shadows on main card
- Reports: warm card shadows on stat cards, DM Serif Display for stat
  values, tabular-nums
- Settings: warm shadow, gold save button (inherited from primary)

**Patient pages:**
- Book: warm card shadow, improved success banner (rounded-xl)
- Appointments: warm shadow, status badges using new palette tokens

**Doctor pages:**
- Schedule: warm card shadow
- Availability: warm card shadows, numbered step indicators

### Files touched
- `src/app/globals.css` — complete token rewrite
- `src/app/layout.tsx` — added DM Serif Display font
- `src/app/page.tsx` — redesigned landing
- `src/app/login/page.tsx` — redesigned
- `src/app/signup/page.tsx` — redesigned
- `src/components/dashboard-header.tsx` — redesigned
- `src/components/nav/sidebar-nav.tsx` — redesigned
- `src/app/{patient,receptionist,doctor}/layout.tsx` — added page-enter
- `src/app/receptionist/{page,pending,walk-in,appointments,reports,settings}/page.tsx` — redesigned
- `src/app/patient/{book,appointments}/page.tsx` — redesigned
- `src/app/doctor/{schedule,availability}/page.tsx` — redesigned

### Deviations from spec
None — ad-hoc design work outside any phase spec.

### Build verification
- TypeScript compiles clean (`tsc --noEmit`)
- Next.js build succeeds (all routes compile)

### Design documentation
- `DESIGN.md` created at project root — full visual system documentation
  with YAML frontmatter tokens, 8 canonical sections, named rules
- `.impeccable/design.json` sidecar created — tonal ramps, shadow/motion
  tokens, component HTML/CSS snippets for the live panel

---

---

## Design pass 2 — "Warm Confidence" deepened, all 15 routes
**Date:** 2026-09-11
**Branch:** main (uncommitted)
**Spec:** none — ad-hoc design work outside any phase spec. The human's brief
was "very basic, no identity, weak design, pages structured not
satisfactorily", with three decisions taken up front: cover all 15 routes as
one system; **deepen** the existing world rather than replace it; free to
change visuals, page structure, and UI copy (product facts stay sacred).

### Why the first revamp still read as basic

Recorded because it is the reasoning this pass is built on. The palette was
never the problem:

1. **The identity never got past the front door.** The landing page had a real
   world (pinned notices, gold pins, settle motion); the interior was stock
   shadcn. The identity existed on 1 of 15 routes.
2. **Every interior page was the same page.** All eight gated routes opened
   with identical boilerplate — `<h1 class="text-2xl font-semibold">` plus an
   inline DM Serif style — then a stack of `Card shadow-warm`.
3. **No middle type register.** 60px hero, 24px page title, nothing between, so
   everything interior read as "a form".
4. **The product's differentiator was invisible.** The DB-guaranteed
   no-double-booking and the honest hybrid flow were never shown anywhere.
5. **Gold carried no information** — a stray header dot, a logo badge.
6. **Zero authored material** — no imagery, texture, or data graphic.
7. **Dead code and fake trust signals** — an unreachable `.dark` block, a
   `next-themes` dependency with no provider, and `(088) 000-0000` rendered on
   the one page whose whole job is building trust.

### What was built

**1. The palette now owns regions instead of scattering accents (Committed,
not Restrained).** New `--field` (`#143d28`, a sanctioned darker step of the
existing primary ramp) owns whole areas: the public hero, the auth split panel,
and every page masthead. Cream remains the ground for records and forms.

**2. Gold got a job, written down as a rule.** Gold marks *time, money, and the
next thing that matters* and nothing else: board pins, the current step, a
`PENDING` state, an unset placeholder, payment references, "still to come" and
"needs attendance" counts, and the masthead hairline. `--gold-ink` (`#8a650a`)
added for gold text under 18px, where canonical gold fails contrast.

**3. A real type scale with the missing middle register.** `display`,
`title`, `stat-figure`, `section`, `lead`, `body`, `label`, `meta`, `data`,
`control`. Page titles went from 24px sans-semibold to `clamp(1.75rem, 3.2vw,
2.375rem)` serif. The main identity move: **every time, date, count,
percentage, phone and payment reference is now set in Geist Mono with tabular
figures** (`--font-geist-mono` was loaded since Phase 1 and completely unused).
The console now reads like a clinic's log book rather than a dashboard, and
figures line up down a column for free.

**4. The desk book.** The landing page's "board" is the clinic's outside wall;
its inside counterpart is the ruled appointment ledger the front desk actually
worked from. New shared vocabulary, used across four pages:
- `PageMasthead` + `MastheadStats` — each page's identity band, and never the
  same twice because it carries that page's real context (the date, the counts,
  the primary action) instead of a bare title.
- `Ledger` / `LedgerRow` / `LedgerTime` / `LedgerHeading` — ruled rows, a
  mono time gutter, authored ink-in stagger.
- `StatusMark` / `AttendanceMark` / `SourceTag` — states as squared inked
  marks rather than pills.
- `StepRail` — numbered steps for the two three-part flows.
- `ProportionBar` — report data drawn from real numbers, no chart library.
- `EmptyState` — dashed blank space that reads as "nothing written here yet",
  always carrying the one action that would fill it.
- `ClinicSeal` — the gold `GF` monogram.

**5. Task-shaped pages, not one template.**
- **Receptionist home** is now the day's run-sheet: a masthead carrying the
  day's real numbers over a time-gutter ledger, instead of three stat cards and
  two card grids.
- **Requests to action** is a decision queue: one card per request showing what
  it was for, who is asking, their phone as a `tel:` link, when they sent it,
  and Confirm / Cancel. The **SMS result is now shown on the page** rather than
  only in a toast, because a failed confirmation is something the desk has to
  act on after the toast is gone.
- **Walk-in registration** is a numbered desk sequence with the step rail, a
  visible "existing record found — it will be reused" state, and gold on the
  payment card (it is where the money is taken).
- **All appointments** is grouped by day, newest first, each day its own ledger
  with attendance marking and cancellation inline; the toolbar moved out of a
  card header into a ruled strip.
- **Reports** carries two headline figures and real data graphics: outcome mix,
  source mix, the attended / marked / never-marked split, and the TEXT DELIVERY
  report (see deviations).
- **Patient booking** is a legible three-step request with a sticky summary and
  a receipt-style confirmation, against the under-3-minutes constraint.
- **Patient history** is a ledger split upcoming vs past, with payment shown
  only where it exists.
- **Doctor schedule** is a date-grouped day agenda; **working hours** is a ruled
  weekly list with an open/closed dot per day instead of a table of inputs.
- **Landing** leads with the clinic's own name at display scale on the deep
  field, today's live hours computed from `doctor_availability`, and the honest
  three-step flow *before* anyone signs up; the pinned board is the second act.
- **Login / signup** moved onto a two-zone shell: field panel with identity
  beside a calm cream form column.

**6. Motion, bounded.** `ink-in` (staggered via a `--i` custom property),
`rule-draw` (the masthead hairline), plus the existing `pin-notice` and
`page-enter`. All four have `prefers-reduced-motion` guards.

**7. Two real bugs fixed along the way (both pre-existing, both found by the
new harness).**
- `src/hooks/use-mobile.ts` read `window.innerWidth` inside the `useState`
  initializer, so the client's first render disagreed with the server's on
  every mobile load — a hydration mismatch on all 10 authenticated routes at
  mobile width, which makes React discard the server tree and re-render from
  scratch. Fixed by starting at the server-safe `false` and syncing from
  `matchMedia` in the effect (the listener was already there, it was just never
  fired initially).
- `Toaster` read its theme from `next-themes`, which has no provider in this
  app, so anyone with a dark-mode OS got dark toasts on a light-only app.
  Pinned to `theme="light"`.

**8. The placeholder phone is no longer published as if real.** The public page
now shows the number only when the clinic has actually set one, and otherwise
says so; the Settings page carries a gold-marked warning while the value is
still the placeholder.

### Files touched

**Design system / shell**
- `src/app/globals.css` — type registers, field/highlight/board tokens, the
  `.mark` / `.ledger-row` / `.stat-figure` / `.field` / `.rule-gold` / `.paper`
  vocabularies, `ink-in` + `rule-draw` motion, single-weight serif guard
- `DESIGN.md` — rewritten from the built world
- `src/app/layout.tsx` — untouched (fonts already loaded)
- `src/components/ui/card.tsx` — warm paper border, `CardTitle` moved from serif
  to the sans `section` register
- `src/components/ui/button.tsx` — added `field`, `field-outline`, `gold`
- `src/components/ui/sonner.tsx` — theme pinned to light
- `src/components/nav/sidebar-nav.tsx` — identity block, grouped nav, gold
  active rule, address footer
- `src/components/dashboard-header.tsx` — quiet cream bar, no backdrop blur
- `src/components/clinic-seal.tsx` — new
- `src/components/console/{page-masthead,ledger,status-mark,step-rail,proportion-bar,empty-state}.tsx` — new
- `src/components/auth/auth-shell.tsx` — new
- `src/lib/brand.ts` — removed the dead `phone` field
- `src/lib/clinic-settings.ts` — `PLACEHOLDER_PHONE` + `isPlaceholderPhone`
- `src/lib/utils.ts` — date-only parsing and display helpers (`formatDateShort`,
  `formatDateLong`, `formatDayHeading`, `todayIso`, `addDaysIso`,
  `relativeDayLabel`) built on the already-installed `date-fns`
- `src/hooks/use-mobile.ts` — hydration fix
- `src/hooks/use-appointments.ts` — added `created_at` to the row shape
- `{patient,receptionist,doctor}/layout.tsx` — padding + `gap-6`

**Routes** — all 13 rendered routes rebuilt: `page.tsx`, `login`, `signup`,
`patient/book`, `patient/appointments`, `receptionist`, `receptionist/pending`,
`receptionist/walk-in`, `receptionist/appointments`, `receptionist/reports`,
`receptionist/settings`, `doctor/schedule`, `doctor/availability`.
(`patient/page.tsx` still just redirects to `/patient/book` — deliberately
left alone.)

**Verification**
- `scripts/screenshot-review.mjs` — rewritten from a 3-page screenshot script
  into a real harness (see below)

### Deviations from spec

No spec governs this pass, so these are deviations from the **Phase 9 spec**
and from prior behaviour that the human should rule on:

1. **Public phone number — RESOLVED (2026-09-11, human decision: revert to
   spec behavior).** The landing page again shows the illustrative number
   `(088) 000-0000` per the Phase 9 spec, now clearly marked "Sample number,
   for illustration" and rendered as plain text rather than a `tel:` link so
   the placeholder is never callable. It is still replaced by the real
   `tel:`-linked number the moment the clinic sets one in Settings
   (`isPlaceholderPhone` gate unchanged).
2. **The SMS report is now rendered.** Phase 8 built and tested `getSmsReport`,
   and `progress.md` describes three receptionist reports, but only two were
   ever surfaced in the UI. It now has a panel on the Reports page. This is a
   **UI addition, not design**; it uses the existing tested function unchanged.
3. **Appointment list order changed** from ascending to newest-first. History
   is read backwards in practice; the original order put last year's records
   above today's.
4. **`PENDING` is now displayed as "Awaiting action"** rather than the raw
   enum, and `CANCELLED` as "Cancelled". The underlying values are unchanged.
5. **The receptionist home page no longer shows a receptionist-contact card.**
   It duplicated the Settings page; the public number is edited in one place.
6. **The patient booking form is no longer a single flat three-column card.**
   Requesting a date, a time and details now reads as three steps, with a
   sticky summary. All existing logic (profile fetch, `find-or-create`,
   `createAppointment`, `SLOT_TAKEN` handling, the `resetBookingForm` path) is
   preserved verbatim; only the composition and one added `receipt` state for
   the confirmation view are new.
7. **Dark mode removal — RESOLVED (2026-09-11, human decision: remove).** The
   `.dark` token block from Phase 1 and the `next-themes` dependency (added
   Phase 4, never provided) were both removed in this pass's commit
   (e023256); `npm ls next-themes` is empty and no `ThemeProvider` exists.
   Deliberately KEPT: the `@custom-variant dark (&:is(.dark *))` override in
   `globals.css` — deleting it would switch Tailwind v4's default variant to
   `prefers-color-scheme`, silently turning shadcn's inert `dark:` utilities
   ON for OS-dark users against a palette with no dark tokens.
8. **`.impeccable/design.json` — RESOLVED (2026-09-11).** Regenerated to
   mirror the built world: field/gold-ink/board/highlight tokens, the ten type
   registers, real shadow and motion values, squared StatusMarks replacing the
   banned pills, and the current named rules (Gold Has a Job, Two-Zone,
   Mono-For-Figures, No Glass). DESIGN.md remains the source of truth; the
   sidecar now agrees with it.

### Test cases

There is no test-case table for this pass. What was actually run:

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass, 0 errors |
| `npm run build` | Pass, all 17 routes compile |
| `npm run lint` | Pass, 0 errors **and 0 warnings** (4 warnings I introduced were fixed) |
| Impeccable detector over `src/app` + `src/components` | **0 findings** (was 17 advisories before `DESIGN.md` was rewritten to match the built world) |
| `node scripts/screenshot-review.mjs` | **26/26 pass** — 13 routes × desktop (1440) and mobile (390) |

The harness asserts, per route and viewport: HTTP status, no uncaught
exception, no console error, **exactly one `h1`**, no page left on a loading
state, and no unexpected role redirect. Passing all 26 is the evidence that
the restructure did not break any route or role boundary.

### Known issues / open items

1. **I could not see any of the renders.** This session has no image-viewing
   tool, so every visual claim above is derived from source and from the
   harness's structural assertions, not from looking at pixels. The 26
   screenshots in `.impeccable/review/` are current and **have not been
   eyeballed by anyone.** The things I would check first, because they are the
   ones a machine cannot verify: whether the deep field reads as confident or
   as heavy on a large monitor; whether the ink-in stagger on a long ledger
   feels authored or slow; and whether the `.mark` inked stamps hold up next to
   each other in a dense list.
   **Resolution (2026-09-11):** human reviewed the running app and reports
   "all works well" — no objections on any of the three concerns above.
2. **Pre-existing test failures, NOT caused by this pass.** Three of the phase
   harnesses fail when run against a database that has already been used, and I
   proved the cause from the database rather than assuming it:
   - `test-phase2` Test 4 fails with `duplicate key ... uq_patients_profile_id`.
     Its test patients `+639174444401` / `+639174444402` are already present, so
     re-inserting them collides. The test is not idempotent.
   - `test-phase9` Test 1 expects exactly 5 `doctor_availability` rows and finds
     6. `test-phase2` line 317-318 inserts `day_of_week: 6`, which I confirmed
     is in the table. Order-dependent pollution.
   - `test-phase8` crashes with `signup failed: User already registered` — its
     patient signup uses a fixed email and is not idempotent either.
   All three pass on a fresh `npx supabase db reset` + `npx tsx
   scripts/seed-staff.ts`, which is how they were designed to run. Phases 3, 4,
   5, 6 and 7 passed as-is. **This pass changed no schema, no RLS policy, and no
   data-layer logic**, so it cannot have caused these.
3. **The review harness created two accounts in the local database:**
   `review.patient@clinic.local` (used for the patient-role screenshots) and a
   `patients` row is *not* created until a booking is submitted, so only the
   auth profile exists.
4. **`walk-in` did not require a phone number at submit time — FIXED
   2026-09-11.** `submitWalkin` guarded name, date and time but not phone,
   while `find-or-create` receives `phone: ""`. The lib's zod schema rejected
   it (phone is required), so no corrupt patient row could be created, but
   the receptionist only found out after filling the whole three-step form,
   via a raw validation toast. Fixed in the walk-in form only, deliberately:
   the guard now requires mobile number alongside name, date and time, the
   submit button is disabled until it is present, and the optional email
   field gets a shape check (the lib would reject a malformed one the same
   late, raw way). `find-or-create` itself is untouched: phone stays the
   required identity key there. Phone keeps its `type="tel" inputMode="tel"`
   attributes (Web Interface Guidelines pass). Verified: `tsc --noEmit`
   clean, eslint clean on the file.

### Walk-in phone validation fix (2026-09-11, follow-up)

- `src/app/receptionist/walk-in/page.tsx`: submit guard + disabled state now
  include `wiPhone.trim()`; malformed optional email caught at form level.
  Rationale: phone is the patient identity key (exact-match reconciliation,
  Addendum A.1), so the desk must not be able to complete a walk-in without
  it. No schema, RLS, or lib changes.

### Commit record

- `e023256` — this pass's code (52 files), including the `.gitignore` addition
  for `.impeccable/review/` (regenerable screenshots kept out of git).
- `61b1925` — doc correction: deviation 7 had claimed the dark-mode block and
  `next-themes` were left in place; both had in fact shipped removed in
  `e023256`.
- Human tested 2026-09-11 and reports all works well. `progress.md` set to
  Closed; the closing status update itself commits on the human's word.

---

## Copy pass — em dashes removed from UI, day headings de-duplicated
**Date:** 2026-09-11
**Branch:** main (uncommitted at time of writing)
**Spec:** none — ad-hoc copy work requested by the human.

### What was built
1. **All visible em dashes removed from UI copy** across 12 files: toast
   messages, dialog bodies, masthead leads, helper lines, and the landing
   page's sample-phone note. Each sentence was re-read and rewritten with a
   period, comma, colon, or parentheses as the sentence required; no blind
   character swaps. Code comments were deliberately left untouched (not
   user-visible). SMS message bodies were checked and are already clean.
2. **Day-heading bug fixed (human-reported).** Ledger day-group headings on
   `receptionist/appointments` and `doctor/schedule` rendered
   "Mon 14 Dec · Monday 14 December": `relativeDayLabel()` returns the short
   date as its fallback for non-adjacent days, and the heading template
   appended the long-form date unconditionally. New shared
   `dayGroupHeading()` in `src/lib/utils.ts` renders "Today" (etc.) for
   adjacent days, otherwise just the full date — never both. Both call sites
   now use it.
3. **Repaired two broken sentences** left by an earlier interrupted edit on
   `patient/book` ("arranged with the clinic cash or GCash" now reads
   "(cash or GCash)").
4. **SMS `provider_response` now records what the provider actually said**
   (`send-confirmation.ts` + the reminder route): `message_id=<id>` on
   acceptance, `error: <message>` on failure, instead of the generic
   "accepted by provider" / "send failed". Failed sends also log to console.
   Behaviour and `sms_logs` row shape unchanged; delivery problems are now
   diagnosable from the table without re-running the send.

### Files touched
- `src/lib/utils.ts` (new `dayGroupHeading()`)
- `src/app/page.tsx`, `src/app/signup/page.tsx`,
  `src/app/patient/{book,appointments}/page.tsx`,
  `src/app/receptionist/{appointments,pending,reports,settings,walk-in}/page.tsx`,
  `src/app/doctor/{schedule,availability}/page.tsx`,
  `src/components/booking/slot-picker.tsx`, `src/components/ui/sonner.tsx`
  `src/lib/sms/send-confirmation.ts`,
  `src/app/api/cron/send-reminders/route.ts` (provider_response detail, item 4)

### Deviations from spec
None — ad-hoc work outside any phase spec.

### Verification
`tsc --noEmit` clean; `npm run lint` clean; screenshot harness **26/26**
(13 routes × desktop + mobile).

---

## Booking/SMS/payment flow critique + hardening
**Date:** 2026-09-11
**Branch:** main (uncommitted at time of writing)
**Spec:** none — ad-hoc review-and-harden pass requested by the human ("criticise and fix the booking flow, how SMS is sent, so a booking is created and pay").

### What was found (critique, ordered by severity)
1. **Walk-in patients never got a confirmation SMS.** Walk-ins are confirmed
   instantly in one pass, but no text was ever sent — the only SMS path was the
   online-request confirm dialog.
2. **No phone normalization anywhere.** `patients.phone` is reconciled by exact
   string match and sent to Semaphore verbatim, so `09171234567`,
   `0917 123 4567` and `+639171234567` were three different patient records
   (breaking the one-person-one-record guarantee) and spaced numbers could
   fail at the provider.
3. **`/api/sms/send-confirmation` checked authentication but not role.** A
   patient session could trigger real (paid) Semaphore sends for their own
   appointments; the request only failed afterwards at the `sms_logs` insert,
   i.e. the SMS went out first and the audit row second.
4. **`SendConfirmationResult.logged` was hardcoded `true`** even when the
   `sms_logs` insert failed — the return value lied about durability.
5. **Reminder cron had no dedup** — triggering it twice in the ±12h window
   double-texted (and double-charged) every confirmed appointment.
6. Minor, noted only: `createAppointment`'s CLOSED_DATE pre-check is
   TOCTOU-racy (the `uq_appointments_slot` index is the real backstop, so
   acceptable); a patient entering another person's unlinked phone number can
   claim that walk-in record; no guard against confirming a request whose date
   has already passed.

### What was fixed (human decided each approach via clarifying questions)
- **Phone canonicalization** — new `normalizePhMobile()` in `src/lib/utils.ts`
  (canonical local `09XXXXXXXXX`; accepts `+63`/`63`/missing leading 0, any
  spacing; returns null for non-PH-mobile input). Applied at every entry point:
  `findOrCreatePatient` (normalize-then-lookup-then-insert, with a clear
  validation error), the walk-in phone lookup (canonical query + canonical
  input), the patient book form (client-side convenience check + placeholder),
  and `sendSms` itself as the last line of defence (invalid number on record =
  typed `failed` log row, no network I/O). Note: existing rows keep their old
  format until that patient books again; there is no DB backfill.
- **Walk-in GCash SMS** — after a successful walk-in booking, GCash payments
  now trigger `/api/sms/send-confirmation` (same receptionist-session path as
  the online flow, with success/failed/transport-error handling). Cash walk-ins
  deliberately do not text: the patient is standing at the desk with a physical
  receipt. Payment reference stays optional everywhere, per decision.
- **Role check on the SMS route** — `POST /api/sms/send-confirmation` now
  verifies the caller's profile role is `receptionist` before touching
  Semaphore. The pre-existing message is unchanged: the paid call now cannot
  happen for non-staff sessions at all.
- **Honest `logged` flag** — `SendConfirmationResult.logged` is now the real
  insert outcome (`!logErr`). The only consumer (phase 7 harness) treats it as
  a truthy success check, so the type widening is compatible.
- **Cron dedup** — the reminder route joins `sms_logs(type, status)` on each
  candidate appointment and skips any that already have a `sent` reminder.
  Failed reminders are still retried.
- **Pending page transport guard** — the confirm dialog's SMS fetch is wrapped
  in try/catch; a network blip now shows the failed-SMS banner instead of an
  unhandled rejection after a successful confirm.

### Files touched
- `src/lib/utils.ts` (new `normalizePhMobile()`)
- `src/lib/patients/find-or-create-patient.ts`
- `src/lib/sms/send-sms.ts`, `src/lib/sms/send-confirmation.ts`
- `src/app/api/sms/send-confirmation/route.ts`
- `src/app/api/cron/send-reminders/route.ts`
- `src/app/receptionist/walk-in/page.tsx`,
  `src/app/receptionist/pending/page.tsx`, `src/app/patient/book/page.tsx`

### Deviations from spec
None against any phase spec — this pass tightened seams the specs left open:
Phase 7's spec said the SMS route must bind to the caller's session so RLS
applies; it never said the route must also verify the caller's *role* (RLS on
`sms_logs` was the only gate, which fires after the provider call). Phase 5/4
specs never specified phone format handling. The GCash-only walk-in SMS is a
product decision the human made explicitly during this pass (spec is silent on
walk-in SMS entirely).

### Verification
- `tsc --noEmit` clean; `npm run lint` clean.
- Harnesses on the drifted local DB (no `db reset` — human's manual test data
  is preserved): phase 7 **8/8** (SMS send/log/deny paths), phase 4 **5/5**
  (confirm/reject/attendance/payment), phase 5 **5/5** (booking + reconciliation).
- Screenshot harness **26/26** (13 routes × desktop + mobile) with a dev server
  running the changed pages.
- **Two pre-existing failures, both stale-state, NOT regressions, both traced
  to local DB drift (doctor availability edited via UI: Mon 05:00, Wed 06:00
  rows) plus the human's own manual-test appointment/SMS rows:**
  - phase 3 Test 3 (expects seeded 09:00-17:00 baseline, got 24 slots from
    05:00) — passes on a fresh `db reset`.
  - phase 8 Tests 1-2 (no-show/SMS report exact counts; the drifted DB holds
    past confirmed rows with NO_SHOW marks and real sms_logs rows in the
    report's ±31d range that the suite's seeding didn't create).
  - phase 2 Test 11 is stale by *design*, not drift: it asserts receptionist
    `sms_logs` inserts are DENIED, which Phase 7 deliberately reversed
    (`sms_logs_insert_receptionist`); its failure output
    (`recInsBlocked=false, docInsBlocked=true`) is Phase 7's intended state.
  A `supabase db reset` + `seed-staff` + rerun would clear 3 and 8; not run

---

## Environment recovery + end-to-end smoke test
**Date:** 2026-09-11
**Spec:** none — (a) environment incident after moving the project from C: to
D: ("supabase start" failing), (b) full-flow verification requested by the
human against the rebuilt database.

### Environment incident (context for the data state)
- The project folder move did NOT move Supabase's data: local Supabase lives
  entirely in Docker's WSL2 disk, which stayed on C:
  (`C:\Users\PC\AppData\Local\Docker\wsl\docker_data.vhdx`, 12 GB).
- C: being 96% full had hung Docker Desktop mid-startup (engine pipe returned
  HTTP 500; backend log showed "still waiting for the engine to respond after
  9m45s"). That hang is why `supabase start` failed after the move.
- Docker's data disk was relocated to `D:\Docker\wsl` and Docker Desktop's
  settings updated (`CustomWslDistroDir` = `D:\Docker\wsl` in
  settings-store.json — note: `DataFolder` alone is NOT the key that moves the
  WSL disk; the backend's own flat-settings dump revealed
  `customWslDistroDir`). WSL distro re-registered against the new path.
  C: freed from 9.6 GB to ~20 GB free; Docker now grows on D: (129 GB free).
- **Data loss, honestly stated:** the earlier disk-full hang corrupted part of
  Docker's metadata. The `supabase_db_*` container and the Postgres volume
  record did not survive it, so the database was rebuilt from migrations +
  seed.sql (schema, RLS, trigger, seeded hours and clinic_settings all intact;
  auth users and any app-entered test data are gone — staff must be re-seeded
  with `npx tsx scripts/seed-staff.ts`, done for receptionist during this run).
- `.env.local` legacy JWT keys still authenticate against the rebuilt stack
  (verified HTTP 200 via REST) — no env changes needed.

### What was built
- `scripts/test-smoke-e2e.ts` (new) — Playwright end-to-end smoke test driving
  the REAL UI in Chromium: patient signup through `/signup` (real
  `handle_new_user` trigger), booking through `/patient/book` with the on-page
  slot picker (`/api/available-slots` against seeded availability), DB
  assertions via service-role (assertions only), receptionist login through
  `/login`, confirm-with-payment through the pending page dialog, and the
  SMS route under `SEMAPHORE_DRY_RUN=true`. Hydration-race-safe (retries with
  `networkidle` + settle waits — first versions of this script failed purely
  on dev-compile/hydration timing, not app bugs). Rerunnable: sweeps its own
  `@test.local` rows first.
- `next.config.ts` — added `allowedDevOrigins: ["127.0.0.1"]`. **This is a real
  app fix surfaced by the browser testing:** Next 16 blocks dev resources for
  non-allowlisted hosts, and this project's canonical local URL is
  `http://127.0.0.1:3000` (matches `supabase/config.toml` `site_url`). Symptom
  was every `/_next/static/chunks/*._.js` request returning 403 in the browser
  (curl saw 200), so no page ever hydrated — sign-up, login and booking were
  all dead at that host, for humans too, not just the test.

### Smoke test results (all PASS)
| Check | Result |
|---|---|
| Receptionist staff account ready (recreated post-rebuild) | PASS |
| Patient signup through /signup lands on /patient | PASS |
| Booking form prefilled from profile | PASS |
| Slot picker shows open times (16 slots, seeded weekday) | PASS |
| Booking receipt shown (request submitted) | PASS |
| patients row created, phone canonicalized (+63… → 09…), profile linked | PASS |
| Appointment PENDING / source=online | PASS |
| Receptionist login lands on /receptionist | PASS |
| Pending request visible on /receptionist/pending | PASS |
| Confirm + payment log → SMS banner shown | PASS |
| Appointment CONFIRMED, method=cash, ref saved | PASS |
| sms_logs: exactly one confirmation row, status=sent (dry-run) | PASS |
| No uncaught page errors on either side | PASS |

### Findings / follow-ups
- **a11y gap (small):** the confirm dialog's "Payment method" `<Label>` has no
  `htmlFor` association with the select trigger, so it isn't announced as the
  combobox's label (the smoke test had to address the trigger by role). Worth
  fixing next time that dialog is touched.
- The script is committed as a reusable sanity harness:
  `npx tsx scripts/test-smoke-e2e.ts` with `npm run dev` running. It needs the
  receptionist account to exist (creates it if missing, same convention as
  `seed-staff.ts`).
- Dev server left running on port 3000 (PID may differ by the time you read
  this); stop it before `db reset`-style work if it interferes.
  here to avoid wiping human test data (decision left to the human).

### Follow-up: `<html>` hydration warning guard (2026-09-12)
- Human reported a React hydration mismatch: a `data-mbtss-nonce` attribute
  appearing on `<html>` client-side. The attribute does not exist anywhere in
  the repo; it is injected by a browser extension before React hydrates (the
  documented "extension messes with the HTML" case). No app code is at fault.
- Added `suppressHydrationWarning` to the `<html>` element in
  `src/app/layout.tsx` — the standard mitigation for extension-injected root
  attributes. Scoped to `<html>` only, so genuine hydration mismatches
  elsewhere still surface. No behavior change.

---

## Design revamp 2 — "Warm Confidence", photographic (all pages + imagery)
**Date:** 2026-09-12
**Branch:** design-revamp-2 (committed and merged to main same day, on the
human's review "looks good")
**Spec:** none — ad-hoc design work requested by the human: "a revamp on the
 design of all pages using skill impeccable, with images in the home page —
 what new hypothetical users would see to avail the service". Three decisions
 taken up front via questions: **new imagery-led world** (replace, not
 deepen), **Filipino clinic life** photography, images **everywhere they
 fit**.

### Where the images came from
All seven photographs are from **Pexels** under the Pexels License (free for
commercial use, modification allowed, **no attribution required** — credits
provided as a courtesy anyway). Sourcing method, honestly stated: Pexels' HTML
pages are Cloudflare-gated against scripted access, so photos were located via
web search (subject + `site:pexels.com`), downloaded straight from the
`images.pexels.com` CDN (not gated; verified 200 image/jpeg), and validated
with `file` (all real JPEGs, correct orientations). Provenance for every file
is in `public/images/CREDITS.md` with its canonical page URL; photographer
names recorded where they could be verified from third-party citations
(cottonbro studio, Los Muertos Crew); the others are marked honestly as
unverified-by-name with the URL as the record. **The doctor portrait was shot
in Davao, Philippines** — the closest honest match for a Cagayan de Oro
family-medicine physician.

### What was built

**1. Photography as a material, by rule.** Three new named rules in
DESIGN.md's Imagery section: *Photo Serves the Story* (people and places of
clinic life, never abstract glamour), *Merge, Don't Paste* (photos touching
the deep field blend into it with a gradient; on cream they sit as rounded
paper objects), and *Honest Faces* (these are models, not the real clinic's
people; the portrait always carries a visible "Photograph for illustration"
note; provenance in CREDITS.md). Plus an alt-text rule: if it could not be
described to a blind caller over the phone, it does not ship.

**2. `CLINIC.images` (brand.ts).** Single source of truth: seven entries with
src/alt (+ `note` on the portrait), so every image is referenced through the
brand object and alt text is written once, next to provenance.

**3. The landing page rebuilt around imagery** (`src/app/page.tsx`). Same
live-data logic (hours from `doctor_availability`, phone gating), new
composition: the hero is now two-column — display-scale name and the honest
three-step flow on the left, the hero photograph framed as a window into the
consult room (`rounded-2xl`, warm border, field-tinted gradient at its foot,
`priority`-loaded) on the right. The three pinned notices now carry their own
photographs (blood-pressure check for services, waiting room for hours, the
Davao portrait for the doctor, with the illustration note). The closing
"Ready when you are." band stands inside the consult photo, merged into the
field by a left gradient. The previous design contract explicitly refused a
stock-photo hero; that contract comment was rewritten, and the reversal was
the human's explicit choice in this pass.

**4. `PageMasthead` gained an `image` slot** — the photograph occupies the
right column on desktop and a bottom band on mobile, merged into the deep
field by a left gradient (`from-[var(--field)]` → transparent), `sizes`
optimized for the narrow column. Pages choose their own subject:

| Page | Image | Why |
|---|---|---|
| Receptionist home | blood-pressure check | the day's care, at a glance |
| Requests to action | reception counter | where requests land |
| Walk-in registration | reception counter | where walk-ins happen |
| Doctor schedule | consult photo | the doctor's own room |
| Working hours | stethoscope texture | the consulting room, quiet |
| Patient: My appointments | waiting room | the space they will sit in |
| Patient booking receipt | family consult | warmth at the confirmation moment |

Deliberately **without** images: All appointments, Reports, Settings (dense
data surfaces — the Two-Zone Rule keeps records on calm cream), and the
booking form's input masthead (the form is the content; its receipt gets the
photo instead).

**5. Auth panel texture.** The login/signup field panel now carries the
stethoscope-on-wood photo at 13% opacity — texture felt more than seen, never
competing with the form.

### Files touched
- `public/images/{hero-family,hero-doctor,doctor-portrait,bp-check,waiting-room,reception,texture-stethoscope}.jpg` (new) + `public/images/CREDITS.md` (new)
- `src/lib/brand.ts` — `CLINIC.images` map + `ClinicImage` type
- `src/components/console/page-masthead.tsx` — `image` slot with merge gradient
- `src/components/auth/auth-shell.tsx` — field-panel texture layer
- `src/app/page.tsx` — rebuilt hero/board/close with imagery
- `src/app/{login,signup}` — unchanged code, new panel via AuthShell
- `src/app/receptionist/{page,pending,walk-in}/page.tsx` — masthead images
- `src/app/doctor/{schedule,availability}/page.tsx` — masthead images
- `src/app/patient/{book,appointments}/page.tsx` — masthead images
- `DESIGN.md` — Imagery section, three named rules, layout + Do/Don't updates

### Deviations from spec
None against a phase spec (none governs this pass). Against prior recorded
design decisions, two reversals — both the human's explicit choices:
1. The old design contract *refused* a stock-photo hero; this world is
   imagery-led by request.
2. The doctor portrait is a stand-in model (Davao shoot) — flagged in-app as
   "Photograph for illustration". Phase 9's no-fabrication stance is preserved
   by the visible note + the CREDITS.md honesty rule; replace before launch.

### Test results

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass, 0 errors |
| `npm run lint` | Pass, 0 errors, 0 warnings |
| `npm run build` | Pass, all 17 routes compile |
| `node scripts/screenshot-review.mjs` | **26/26 pass** (13 routes × desktop 1440 + mobile 390) |

### Environment incident during verification (resolved)
The harness initially could not sign in: the recent e2e smoke script had
(re)created `receptionist@clinic.local` with password `test-password-123`
while the screenshot harness (following `seed-staff.ts`) uses
`dev-password-only`, and seed-staff's idempotent path never updates existing
users' passwords. Fixed by a one-off service-role password alignment (script
ran and was deleted), then `seed-staff.ts` re-run to create the missing
doctor account. Convention note for the future: **staff/staging passwords are
`dev-password-only`; if another script creates or resets those accounts, it
must use the same password** (the smoke test's own constant is its own
convention and now diverges — harmless, but worth unifying eventually).

### Known issues / follow-ups
1. **The screenshots have not been eyeballed by a human** — same honest limit
   as Design pass 2: the harness asserts structure (status, console, single
   h1, no stuck loading, no wrong-role redirect), not beauty. The 26 captures
   are in `.impeccable/review/`. First things to eyeball: whether the hero
   photo's field-tinted gradient reads as intentional on desktop; whether the
   masthead merge gradient is strong enough to keep the mono stats legible;
   whether the closing band's text holds contrast over the consult photo.
2. Images total ~1.3 MB; `next/image` serves them resized (never larger than
   the slot), so page weight is bounded, but real optimization (AVIF/WebP
   pipeline) is a Phase 10/deployment concern.
3. The doctor portrait's EXIF says 1200×1598; `next/image` handles the
   object-position crop, but if the real physician's photo replaces it, match
   roughly portrait 3:4 for the same framing.
4. The e2e smoke test (`scripts/test-smoke-e2e.ts`) still creates its own
   receptionist with `test-password-123` if the account is missing — see the
   incident note above.

---
