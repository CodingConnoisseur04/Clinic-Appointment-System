# Progress

At-a-glance status. Update the table whenever a phase changes state.
For details on what happened in a phase, see changelog.md.

| Phase | Name | Status | Spec | Notes |
|---|---|---|---|---|
| 1 | Scaffold & schema | Closed | /specs/phase-1-project-scaffold-database-schema.md | All 9 test cases pass; committed |
| 2 | Auth + role-based access | Built — awaiting test | /specs/phase-2-auth-role-based-access.md | All 13 spec tests pass; after `db reset` re-run `npx tsx scripts/seed-staff.ts` |
| 3 | Slot-conflict logic (app layer) | Closed | /specs/phase-3-slot-conflict-logic.md | All 12 tests pass; run seed-staff after `db reset`, dev server needed for Test 6 |
| 4 | Receptionist flow | Closed | /specs/phase-4-receptionist-flow.md | Automated + manual tests pass; committed |
| 5 | Patient booking flow | Closed | /specs/phase-5-patient-booking-flow.md | Automated + manual tests pass (incl. full-stack round-trip); committed |
| 6 | Doctor schedule view | Closed | /specs/phase-6-doctor-schedule-availability.md | Automated + manual tests pass; committed |
| 7 | Semaphore SMS | Closed | /specs/phase-7-semaphore-sms.md | Automated + manual tests pass (incl. real send); dual-session hardening committed |
| 8 | Reports | Closed | /specs/phase-8-reports.md | Automated + manual tests pass; committed |
| 9 | Landing, branding & logout | Built — awaiting test | /specs/phase-9-landing-branding-logout.md | Harness 3/3 + regressions clean; mobile fix pass done; manual tests 4-10 pending (human) |
| 10 | Remote deployment & production readiness | Not started | /specs/phase-10-deployment.md | Guard local-only scripts, decide email confirmation policy, hosting platform, redirect URLs, SMS cost/testing plan before going live. Row corrected from `phase-9-deployment.md` to match this file's own note below that deployment is Phase 10. |

**Status values:** Not started → Planning (Claude Chat) → Plan mode (OpenCode) →
Building → Built — awaiting test → Closed (tested, changelog + commit done)

## Current focus

**Design pass 2 — "Warm Confidence" deepened: Built — awaiting test.** Not a
phase and has no spec; see `changelog.md` → "Design pass 2". All 13 rendered
routes rebuilt as one system on the existing palette rather than a new one.

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

**Nobody has looked at the screenshots yet** — this session had no image
viewing, so `.impeccable/review/*.png` (26 files, current) still needs human
eyes. Of the three items that needed a decision, one is now closed: the
unreachable dark mode was removed (`.dark` block + `next-themes` dep; the
`@custom-variant` override stays as a safety guard — see changelog deviation
7). Still open: the public phone number (I hide it rather than print the
placeholder) and the stale `.impeccable/design.json` sidecar.

Phase 9 built — awaiting human test. Deployment is Phase 10 — spec must be named
`phase-10-deployment.md`.

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
