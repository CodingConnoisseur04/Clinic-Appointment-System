# Project Agent Instructions

## Project constraints (condensed from /docs/Master_Handoff_Clinic_System.md)
Full rationale lives in that doc — read it only if a specific decision needs
justification. These are the constraints that apply across every phase:

**Do not build, ever (explicitly out of scope):**
Full EMR, insurance claims, multi-branch support, telemedicine, any payment
gateway (PayMongo etc. — payment is manual reference logging only), billing
installments/refunds, doctor leave/bulk-reschedule, waitlisting, Google
Calendar integration, patient self-service reschedule/cancel (Receptionist
only), email notifications (SMS-only via Semaphore).

**Non-functional constraints:**
- Patient-facing form must be completable in under 3 minutes
- Role-based access enforced via RLS — no bypassing via service role in
  client-facing code paths
- Must work on both desktop and mobile browsers
- Schema should comfortably handle ~200 patient records (no premature
  optimization needed, but don't design something that breaks at that scale)

**Role boundaries:**
Patient: requests appointments, cannot reschedule/cancel/confirm own
appointments. Doctor: read-only on schedule/appointments, sets own
availability. Receptionist: full read/write on appointments, the
operational hub.

## Local environment
Supabase runs locally via CLI + Docker (`supabase start`), not the hosted
console. All schema changes MUST go through migration files in
`supabase/migrations/*.sql` — never apply schema changes only via Studio's
UI. Bootstrap/seed data goes in `supabase/seed.sql`. No hosted/production
Supabase project exists yet.

## Workflow context
This project is built in phases. Each phase has a spec at
`/specs/phase-N-name.md`, written externally (Claude Chat) and placed
into this repo before you plan or build against it.

## After every build mode run, before ending the session
1. Update `changelog.md`: append/fill the entry for the current phase —
   what was built, any deviations from the spec (be specific and honest;
   this file is reviewed by a human before the next phase is planned),
   files touched, known issues.
2. Update `progress.md`: set the current phase's status to "Built — awaiting
   test" and fill in the Notes column if relevant.
3. Do NOT run `git commit`. Do not stage or commit anything automatically.
   The human tests the phase manually first; commit only happens after
   that, on explicit instruction (e.g. "commit phase N" or "tests pass,
   commit this").
4. When explicitly told to commit, use this message format:
   `Phase N: <name> — <one-line summary>`
   Include changelog.md and progress.md in the same commit as the code
   changes so they never drift apart in git history. Then update
   progress.md's status to "Closed."

## On test failure
If the human reports a phase failed testing:
1. Do not start a new spec or reinterpret requirements — re-attempt build
   mode against the SAME spec at `/specs/phase-N-name.md`.
2. Before retrying, log the failure in `changelog.md` under a "Failed
   attempts" subsection for this phase: what broke, suspected cause.
3. Fix and rebuild. Update `changelog.md`'s main entry as usual once done.
4. Retry cap: after 2 failed attempts on the same phase, stop and tell
   the human explicitly rather than trying a third time — repeated
   failure likely means the spec itself has a gap, not an implementation
   bug, and needs to go back to planning.
5. Status in `progress.md` stays "Built — awaiting test" through retries;
   only moves to "Closed" after human confirms tests pass and commits.

## Test cases
If the spec includes a "Test cases" table, implement against those cases
explicitly and report pass/fail for each in the changelog entry, not just
a general "tests pass."

## Divergence reporting
If your plan-mode output differs from what the spec described (different
approach, different schema shape, etc.), do not silently resolve it —
flag it clearly in the changelog's "Deviations from spec" section even
if you believe your approach is better. The human decides which is kept.
