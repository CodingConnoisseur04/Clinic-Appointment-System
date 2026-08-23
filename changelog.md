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

## Phase 2 — [Name]
**Date closed:**
**Spec:** /specs/phase-2-....md

### What was built
-

### Deviations from spec
-

### Files touched
-

### Known issues / follow-ups
-
