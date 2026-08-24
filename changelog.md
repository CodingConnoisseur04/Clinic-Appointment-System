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

## Phase 3 — [Name]
**Date closed:**
**Spec:** /specs/phase-3-....md

### What was built
-

### Deviations from spec
-

### Files touched
-

### Known issues / follow-ups
-
