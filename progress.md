# Progress

At-a-glance status. Update the table whenever a phase changes state.
For details on what happened in a phase, see changelog.md.

| Phase | Name | Status | Spec | Notes |
|---|---|---|---|---|
| 1 | Scaffold & schema | Closed | /specs/phase-1-project-scaffold-database-schema.md | All 9 test cases pass; committed |
| 2 | Auth + role-based access | Built — awaiting test | /specs/phase-2-auth-role-based-access.md | All 13 spec tests pass; after `db reset` re-run `npx tsx scripts/seed-staff.ts` |
| 3 | Slot-conflict logic (app layer) | Not started | /specs/phase-3-slot-conflict-logic.md | High-risk — reused 3x (FR3/3a/6a); depends on Phase 2 for patient identity |
| 4 | Receptionist flow | Not started | /specs/phase-4-receptionist.md | Most complex screen |
| 5 | Patient booking flow | Not started | /specs/phase-5-patient-booking.md | |
| 6 | Doctor schedule view | Not started | /specs/phase-6-doctor-view.md | |
| 7 | Semaphore SMS | Not started | /specs/phase-7-sms.md | External dependency |
| 8 | Reports | Not started | /specs/phase-8-reports.md | |

**Status values:** Not started → Planning (Claude Chat) → Plan mode (OpenCode) →
Building → Built — awaiting test → Closed (tested, changelog + commit done)

## Current focus
Phase 2 closed (tested, committed). Next: plan Phase 3 — Slot-conflict logic (app layer).

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
