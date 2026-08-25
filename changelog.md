# Changelog

Record of what was actually built, per phase. Updated at phase closeout,
right before syncing back to Claude Chat for the next phase's planning.
This is the source of truth when it diverges from the spec in /specs/.

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
- Known gap carried per spec §5: closures/hours changes never cancel or move
  existing bookings; the warning count is visibility only.
- No live updates; tab data refreshes via explicit reloads/actions only.

---

## Phase 7 — Semaphore SMS
