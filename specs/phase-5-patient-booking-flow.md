# Phase 5 — Patient Booking Flow

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 4 entry (real repo state) — shared login/`requireRole` exist, `/patient` doesn't yet (known issue: a logged-in patient hitting `/receptionist` redirects there and 404s), Phase 4's manual browser tests 7–11 are still outstanding.
**Feeds into:** Phase 6 (Doctor schedule view) reuses the same auth/layout pattern a third time. This phase is also what finally makes Phase 4's Pending Requests tab testable against a *real* submission instead of manually-seeded test data.

---

## 0. Objective

This phase closes the loop the whole project has been building toward: a real patient can sign up, submit an online booking request, and have it show up in the receptionist's queue from Phase 4 — the first genuine end-to-end path through the system. By the end of this phase:

- A visitor can self-register a patient account and land on a patient home page.
- That patient can pick a date, see real availability (reusing Phase 3's slot logic exactly, not reimplementing it), and submit a request.
- Their first booking also resolves their `patients` record — exercising `findOrCreatePatient`'s create-path for real, in a browser, for the first time (Phase 3 tested this via harness; Phase 4 exercised the *reconciliation* path via walk-ins; this phase is the first real run of a brand-new patient hitting it).
- They can see their own appointment history and nothing anyone else's — the same RLS guarantee Phase 2 built, now exercised through the actual UI rather than a test script.

**Before starting build mode, resolve one loose end from Phase 4:** its changelog explicitly says manual browser tests 7–11 "remain for the human." If those haven't been run yet, this phase is being built on top of an unverified UI layer (the shared login page, the role guard). Worth doing now — and Test 9 in this phase's §4 will retroactively cover most of what Phase 4's Test 10 (pending-tab end-to-end) needed anyway, since a real submission from this phase is a better test than a manually-seeded one.

---

## 1. Prerequisite check: does signup actually work end-to-end?

**Verify before building the signup page, not after:** Supabase's local stack may require email confirmation before a `signUp()` call returns an active session — if so, a patient submitting the signup form gets an account but no session, and can't book anything until they click a confirmation link that, on a local Docker stack with no real mail server, they'll never receive. Check `supabase/config.toml` under `[auth.email]` for `enable_confirmations`. If it's `true` (or unset and defaulting true), set it to `false` for local dev — a course project with a 3-person test user base doesn't need working email delivery, and this project already made an equivalent call in Phase 2 (staff accounts created with `email_confirm: true` specifically to skip this).

This is exactly the shape of surprise that's hit nearly every previous phase (Phase 1's GRANT defaults, Phase 3's GRANT-on-new-table, Phase 2's `app_metadata` timing) — a CLI/config default that silently blocks a feature that reads correctly in the spec. Check it first.

---

## 2. Signup page

### 2.1 `src/app/signup/page.tsx`

Fields: email, password, full name, phone (E.164-ish validation via zod — doesn't need to be strict, just enough to reject obviously-wrong input before it becomes an undeliverable SMS target later). Calls `supabase.auth.signUp()` client-side with `full_name`/`phone` in `options.data` (→ `user_metadata`, per Phase 2 §1 — **never** pass anything into a `role` field here; there's no role selector on this form at all, matching Phase 2's "no public path to staff roles" decision). On success, redirect to `/patient`.

The `handle_new_user` trigger (Phase 2) fires automatically and creates the `profiles` row with `role = 'patient'` — nothing new needed there, this page is just the front door to a path Phase 2 already built and tested.

---

## 3. Patient dashboard

### 3.1 `src/app/patient/layout.tsx`

Wraps `/patient/**` with `requireRole(['patient'])`, same pattern as Phase 4's receptionist layout. This is also what resolves Phase 4's known 404 — a patient landing here now gets a real page instead of a dead end.

### 3.2 `src/app/patient/page.tsx`

Two sections on one page — mirrors Phase 4's "one page, tabs" simplicity call, but this dashboard is small enough not to need tabs at all, just two stacked sections:

**Book an Appointment**
1. Date picker (shadcn `Calendar`, same component Phase 1 installed).
2. On date select, fetch `/api/available-slots?date=...` — Phase 3's route, unmodified, already authenticated-gated. This is the same call Phase 4's walk-in form makes; if extracting a shared `<SlotPicker>` component to avoid the two forms drifting independently is low-effort, do it — not required, but worth doing given there'll now be two call sites of the identical pattern.
3. Contact details, pre-filled from `profiles.full_name`/`phone` (already collected at signup), editable — this is the "confirm your details" moment that satisfies FR1's registration step without a separate page, matching the pattern Phase 3's spec (§3, end-to-end test) already anticipated.
4. Reason (optional).
5. Submit: call `findOrCreatePatient` (via Phase 3's `/api/patients/find-or-create` route — reused exactly as shipped, same as Phase 4 reused it for walk-ins) with the confirmed contact details and the patient's own `profileId`, then `createAppointment` with `source: 'online'` (status defaults to `PENDING` — Phase 4's extension to that function isn't needed here, the online path uses the original Phase 3 defaults untouched).
6. On success, show a message that matches Addendum A.2's actual flow — something like *"Request received. Our staff will contact you to confirm payment and details."* Don't imply instant confirmation; that would misrepresent what the hybrid flow (Addendum A.2) actually does.
7. On a `SLOT_TAKEN` result (someone else booked it between the page loading and the patient submitting), show a clear "that slot's no longer available, pick another" message and refresh the slot list — don't let the typed error surface as a raw failure.

**My Appointments**
A read-only list of the patient's own `appointments` rows (RLS's `appointments_select_own` policy applies directly here — unlike slot-reading in Phase 3 §2.1.1, a patient reading *only their own* rows isn't the cross-patient problem that forced that route through `admin.ts`; this can query straight through the patient's own session). Show date/time, status, and — for `CONFIRMED` rows — the logged payment method/reference, so the patient has a receipt-like record of what was confirmed.

---

## 4. Test Cases

**Automated (`scripts/test-phase5.ts`), same real-session pattern as Phases 2–4:**

1. A freshly-signed-up patient session has no `patients` row; calling `findOrCreatePatient` with their `profileId` creates one — first non-mirrored, non-harness-seeded exercise of this exact path.
2. `createAppointment` from that patient's session with `source: 'online'` produces a `PENDING` row correctly (defaults untouched by Phase 4's extension).
3. A second booking by the *same* patient reuses the same `patients` row — `findOrCreatePatient` doesn't create a duplicate (exercises `uq_patients_profile_id`'s idempotency guarantee for a returning patient, not just the walk-in-linking case Phase 3/4 already covered).
4. Patient A's session cannot see Patient B's appointments via `appointments_select_own` — re-confirms Phase 2 Test 4's property, now with two real signed-up accounts rather than seeded test rows.
5. Booking into a slot pre-taken by a concurrently-created appointment returns the typed `SLOT_TAKEN` result, not a crash (mirrors Phase 3 Test 8's property, invoked through the same code the UI now calls).

**Manual, browser-based:**

6. Sign up as a new patient, confirm redirect to `/patient`, confirm `profiles.role = 'patient'` in the DB.
7. Book a real appointment through the actual form — date picker, real slot list, submit, see the confirmation message.
8. **The integration test that matters most:** switch to the receptionist dashboard (Phase 4), confirm the just-submitted request appears in the Pending Requests tab with correct patient info, confirm it, switch back to the patient dashboard, confirm the status now reads `CONFIRMED` with the logged payment info visible. This one flow exercises Phases 2 through 5 together for the first time.
9. Attempt booking a slot that's already taken (book it as a receptionist walk-in first, then try to submit the same slot as the patient) — confirm the graceful "slot unavailable" UI path, not a broken form.
10. Any of Phase 4's still-outstanding manual tests 7–11 that weren't run yet — do them now alongside this phase's, since `/patient` existing removes the blocker that was in the way.

---

## 5. Explicitly deferred to later phases

- Doctor schedule view (Phase 6).
- SMS on confirmation (Phase 7) — the patient's confirmation message in §3.2 step 6 explicitly does not promise an SMS yet.
- Patient self-service cancel/reschedule — still out of scope per the original design (Section 3); "My Appointments" here is read-only by design, not an oversight.
- Reports (Phase 8).

---

## 6. Handoff notes for OpenCode plan mode

- **§1's config check is the one thing worth confirming before writing any signup code**, not after — if `enable_confirmations` needs flipping, that's a one-line config change, but discovering it *after* building the form (the way Phase 1 discovered the GRANT issue after building the connectivity check) just costs a retry cycle for no reason.
- The shared `<SlotPicker>` extraction mentioned in §3.2 step 2 is optional cleanup, not a spec requirement — don't let it become scope creep if it turns out to be fiddly to factor out cleanly from Phase 4's existing walk-in form.
- No cancel/reschedule button anywhere on `/patient` — if plan mode proposes adding one "since it'd be easy," that's expanding scope the design document explicitly closed off (Section 3's out-of-scope list), not a small addition to wave through.
