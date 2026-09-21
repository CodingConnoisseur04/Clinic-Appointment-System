# Progress

At-a-glance status. Update the table whenever a phase changes state.
For details on what happened in a phase, see changelog.md.

## Current state — handoff summary (2026-09-21)
Written so a fresh session can orient without reading everything below.

- **Where the project is:** all 10 planned phases are done or closed
  (Phase 10 / deployment never started — no spec exists yet). Three
  post-phase upgrade features are also merged: fee collections +
  collections report (Feature 1), Senior/PWD flag + discount prefill
  (Feature 2), report charts + print handout (Feature 3). An in-place
  receptionist reschedule and two "Warm Confidence" design passes are also
  closed and merged. Everything is on `main`; feature branches are deleted
  after merge; working tree is clean as of this note.
- **What is NOT built:** deployment/hosting (Phase 10), UX-flow polish
  (upgrade 4), architecture cleanup (upgrade 5). SMS is Semaphore with
  `SEMAPHORE_DRY_RUN=true` currently set in `.env.local`.
- **Local DB state:** rebuilt from migrations + seed on 2026-09-18
  (`db reset` during chart verification); staff reseeded; holds fixture
  rows from the senior and fee harnesses so demo reports show data —
  `resetTestState()` sweeps them if a from-empty demo is wanted.
- **Standing gotchas:** every `supabase db reset` wipes auth users → re-run
  `npx tsx scripts/seed-staff.ts`; phase harnesses are reset-required
  (they fail on a used DB — documented per entry, not regressions);
  `npx shadcn add` overwrites customized components (it clobbered
  `card.tsx` once — check `git diff` right after); the doctor portrait and
  all imagery are Pexels stand-ins (provenance in
  `public/images/CREDITS.md`), portrait must be replaced before launch.
- **Records audit 2026-09-21:** status corrections applied this day —
  Phase 2 row corrected from "Built — awaiting test" to Closed (its
  changelog entry was already dated closed 2026-08-24 and its commit
  `bc0290b` is on main — the row was simply never updated); Phase 9 marked
  Closed on the human's confirmation that testing was completed (retroactive,
  exact date unrecorded); the reschedule note's "branch retained" corrected
  (branch deleted after merge). No code changed in this audit.

| Phase | Name | Status | Spec | Notes |
|---|---|---|---|---|
| 1 | Scaffold & schema | Closed | /specs/phase-1-project-scaffold-database-schema.md | All 9 test cases pass; committed |
| 2 | Auth + role-based access | Closed | /specs/phase-2-auth-role-based-access.md | All 13 spec tests pass; committed `bc0290b`. Row corrected to Closed 2026-09-21 — changelog had it closed 2026-08-24 but this row was never updated. After `db reset` re-run `npx tsx scripts/seed-staff.ts` |
| 3 | Slot-conflict logic (app layer) | Closed | /specs/phase-3-slot-conflict-logic.md | All 12 tests pass; run seed-staff after `db reset`, dev server needed for Test 6 |
| 4 | Receptionist flow | Closed | /specs/phase-4-receptionist-flow.md | Automated + manual tests pass; committed |
| 5 | Patient booking flow | Closed | /specs/phase-5-patient-booking-flow.md | Automated + manual tests pass (incl. full-stack round-trip); committed |
| 6 | Doctor schedule view | Closed | /specs/phase-6-doctor-schedule-availability.md | Automated + manual tests pass; committed |
| 7 | Semaphore SMS | Closed | /specs/phase-7-semaphore-sms.md | Automated + manual tests pass (incl. real send); dual-session hardening committed |
| 8 | Reports | Closed | /specs/phase-8-reports.md | Automated + manual tests pass; committed |
| 9 | Landing, branding & logout | Closed | /specs/phase-9-landing-branding-logout.md | Harness 3/3 + regressions clean; mobile fix pass done. Marked Closed 2026-09-21 on human's confirmation that testing (incl. manual tests) was completed — retroactive, exact test date unrecorded |
| 10 | Remote deployment & production readiness | Not started | /specs/phase-10-deployment.md | Guard local-only scripts, decide email confirmation policy, hosting platform, redirect URLs, SMS cost/testing plan before going live. Row corrected from `phase-9-deployment.md` to match this file's own note below that deployment is Phase 10. |

**Status values:** Not started → Planning (Claude Chat) → Plan mode (OpenCode) →
Building → Built — awaiting test → Closed (tested, changelog + commit done)

## Upgrade track (post-phase plan, ad-hoc per agreed approach)

| # | Branch | Feature | Status | Notes |
|---|--------|---------|--------|-------|
| 1 | feat/fee-collections | Fee amount logging + collections report | Closed | 9/9 harness, P3/P4/P5/P7/P8 regressions pass; policy leak + Semaphore response-shape bug found & fixed; merged to main |
| 2 | feat/senior-pwd-priority | Senior/PWD priority lane + configurable discount | Closed | Human ordered commit 2026-09-18; merged to main (`efd3608`), branch deleted. 12/12 harness, P3/P4/P7/P8 + fee regressions pass, tsc/lint/build clean, screenshots 26/26; row toggle added as follow-up; UI em dashes replaced with hyphens pre-commit |
| 3 | feat/reports-charts | Charts & visual reports | Closed | Human ordered commit 2026-09-18; merged to main (`27f287b`), branch deleted. Collections per-day area + peak-hours bars + print CSS; prose trimmed and SMS card removed per human feedback. tsc/lint/build clean, screenshots 26/26, fee/senior/P3/P8 suites pass on fresh reset |
| 4 | feat/ux-flow-polish | User-flow audit & polish (all surfaces) | Not started | |
| 5 | feat/arch-cleanup | Architecture cleanup (god pages, raw queries, utils) | Not started | Last; extract-on-touch during 1–4 shrinks it |

## Current focus

**Receptionist in-place reschedule: Closed — same-day browser test run by the
agent 2026-09-12 (9/9), human ordered the commit and the merge to main
(`8885451`, merged `c990668`; branch `feat/reschedule` deleted after merge).** Not a
phase and has no spec; see `changelog.md` → "Receptionist in-place
reschedule". Closes the gap the human found testing: the desk could
confirm/cancel/mark attendance but could not change an appointment's time.
New lib function (typed outcomes, DB-level slot backstop, past/cancelled
guards; "past" = already started per human decision, so today's remaining
slots stay movable) + "Move" dialog with the shared slot picker on All
appointments + automatic re-confirmation text for moved CONFIRMED
appointments. Harnesses: API-level 13/13, browser 9/9; tsc/lint/build clean;
screenshots 26/26. Patients still cannot reschedule (constraint intact,
enforced by RLS — harness T8).

**Design revamp 2 — "Warm Confidence", photographic: Closed — human reviewed
2026-09-12 ("looks good"), commit ordered same day.** Not a phase and has no
spec; see `changelog.md` → "Design revamp 2". A new imagery-led world on the
human's explicit decisions (replace rather than deepen, Filipino clinic life
photography, images everywhere they fit): photo hero on the landing page,
photos in the board notices, a photograph slot in every role-appropriate
masthead, an auth-panel texture layer. All imagery is free-license Pexels with
provenance in `public/images/CREDITS.md`; the doctor portrait is a marked
stand-in to be replaced before launch. Verified: tsc/lint/build clean,
screenshot harness 26/26.

**Design pass 2 — "Warm Confidence" deepened: Closed — human tested
2026-09-11 ("all works well").** Not a phase and has no spec; see
`changelog.md` → "Design pass 2". All 13 rendered routes rebuilt as one system
on the existing palette rather than a new one.

- The palette now **owns regions** instead of scattering accents: a deep forest
  field (`--field`, a darker step of the existing primary ramp) carries the
  public hero, the auth panel and every page masthead; cream ground carries the
  records.
- **Gold got a rule.** It marks time, money, and the next thing that matters —
  a `PENDING` state, the current step, a payment reference, the count that needs
  acting on. Nothing decorative.
- **A real type scale**, including the missing middle register, and a mono data
  layer: every time, date, count, phone and payment reference is Geist Mono with
  tabular figures. Geist Mono had been loaded and unused since Phase 1.
- **New shared vocabulary:** `PageMasthead`, `Ledger`, `StatusMark`, `StepRail`,
  `ProportionBar`, `EmptyState`, `ClinicSeal`. Task-shaped pages replaced the
  one-template-eight-times pattern.
- **Mobile hydration bug fixed** (`use-mobile.ts`), plus dark toasts on a
  light-only app (`sonner.tsx`).

Verification: build clean, lint clean (0 warnings), detector 0 findings, and
`node scripts/screenshot-review.mjs` **26/26** (13 routes × desktop + mobile;
asserts HTTP status, no console/page errors, exactly one `h1`, no stuck loading
state, no wrong-role redirect).

**Human reviewed 2026-09-11 — passed** ("all works well"); the screenshot
eyeball gate is closed. All three items that needed a decision are resolved:
the unreachable dark mode was removed (`.dark` block + `next-themes` dep; the
`@custom-variant` override stays as a safety guard), the landing page shows
the clearly-marked sample phone per the Phase 9 spec again, and
`.impeccable/design.json` was regenerated to mirror the built world. See
changelog deviations 1, 7 and 8.

Phase 9 Closed (confirmed 2026-09-21, retroactive). Deployment is Phase 10 — spec must be named
`phase-10-deployment.md`.

**Environment note 2026-09-11:** Docker/Supabase data disk moved C: → D:
(`D:\Docker\wsl`) after a disk-full hang; the local DB was rebuilt from
migrations + seed (auth users wiped — staff re-seeded via `seed-staff.ts`;
manual test data gone). End-to-end smoke test (patient signup → booking →
receptionist confirm → SMS log) passes 13/13 against the rebuilt stack — see
`changelog.md` → "Environment recovery + end-to-end smoke test". Reusable via
`npx tsx scripts/test-smoke-e2e.ts` with the dev server running.

## Renumbering note (this update)
Auth + role-based access was missing from the original phase list entirely;
"Slot-conflict logic" was incorrectly slotted in as Phase 2 with a spec
filename (`phase-2-slot-logic.md`) that was never actually written. Auth is
now Phase 2 — appointments can't be correctly attributed to a real patient
identity, and role-gated access can't be tested meaningfully, without it
existing first. Slot-conflict logic moves to Phase 3 and depends on Phase 2
being closed. Phases 3–7 from the original list are renumbered to 4–8
accordingly; no content changes to what those phases will cover, only their
numbers and spec filenames.
