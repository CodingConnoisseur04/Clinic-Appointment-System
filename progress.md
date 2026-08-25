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
| 7 | Semaphore SMS | Not started | /specs/phase-7-sms.md | External dependency |
| 8 | Reports | Not started | /specs/phase-8-reports.md | |
| 9 | Remote deployment & production readiness | Not started | /specs/phase-9-deployment.md | Guard local-only scripts, decide email confirmation policy, hosting platform, redirect URLs, SMS cost/testing plan before going live |

**Status values:** Not started → Planning (Claude Chat) → Plan mode (OpenCode) →
Building → Built — awaiting test → Closed (tested, changelog + commit done)

## Current focus
Phase 6 closed (tested, committed). Next: plan Phase 7 — Semaphore SMS.

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
