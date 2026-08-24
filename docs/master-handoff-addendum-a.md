# Master Handoff — Addendum A (Post-Phase 2 Design Review)

**Status:** Proposed — needs team sign-off before treated as settled, same standing as Sections 1–11 once agreed.
**Trigger:** A design review done after Phase 2 (Auth + RLS) surfaced cross-role gaps that no single per-role flowchart in Section 8 would have caught on its own. This addendum resolves them rather than leaving them implicit.
**Scope:** Amends Sections 3, 4, 5, and 9. Does not reopen Sections 1, 2, 6, 7, 10, 11.

---

## A.1 — Patient identity: one record per real person

**Gap:** Nothing in the original design decides that one real-world patient maps to exactly one `patients` record. A walk-in later signing up online gets a second, disconnected record with no shared history.

**Resolution:**
- **Schema-level:** add a partial unique constraint — `unique (profile_id) where profile_id is not null` — so no profile can ever be linked to more than one patient record. (Concrete follow-up: small migration before Phase 3 starts.)
- **Reconciliation policy (manual, not automatic):** when a receptionist registers a new online-linked patient or a walk-in, they check the phone number field against existing records first. If a match is found, the existing record is reused (its `profile_id` gets set, if it was previously null) rather than a duplicate created. This is a receptionist workflow step, not new database logic — cheap to note in the UI copy for the registration form in the relevant future phase.
- **Left explicitly out of scope:** automatic fuzzy-matching or merge tooling for records that already diverged before someone noticed. If two records already exist for the same person, manual correction by the receptionist (update one row's `profile_id`, leave the duplicate orphaned or delete it — decide at that time) is acceptable for this system's scale.

**Section amended:** add to Section 3's "Explicitly Out of Scope" — *"Automatic deduplication/merging of patient records; duplicate prevention is a manual receptionist check at registration time, not a system guarantee."*

---

## A.2 — Online booking cannot self-serve to confirmation

**Gap:** Section 8.3's flowchart collects payment *before* confirming, for every path. A walk-in is standing at the desk, so this works. An online patient is not physically present — payment cannot be collected before confirmation without some communication happening outside the system.

**Resolution:** Make explicit what was previously only implied — **online requests never auto-confirm.** The real flow is: patient submits online request (status `PENDING`) → receptionist contacts the patient (phone call, or patient calls in, or messages in an out-of-band channel) to arrange payment and confirm details → receptionist logs the payment reference and manually confirms → SMS confirmation sends. This is not a workflow gap to fix; it's an accurate description of a **hybrid** system, not a self-service one, and should be described that way rather than implied to be fully automatic.

**NFR correction:** Section 5's performance NFR — *"Appointment confirmation processed and sent within 2 minutes"* — is only achievable for the **walk-in** path (payment collected in person, immediate confirmation). For online requests, this target should be reworded to apply from the point the receptionist begins processing the request, not from submission, since submission-to-confirmation inherently includes a human follow-up step with no fixed time bound.

**Sections amended:**
- Section 5, Performance row: split into two rows — *"Walk-in confirmation processed within 2 minutes of payment received"* and *"Online request acknowledged (received, pending receptionist follow-up) within 2 minutes; confirmation timing depends on receptionist contact with patient, not system-bound."*
- Section 8.1 (Patient Flow diagram): the `WaitConfirm` node should be understood to include an out-of-band contact step for the online path specifically — worth a note on the diagram itself in a later documentation pass, not a re-draw now.

---

## A.3 — No mechanism for one-off closures

**Gap:** `doctor_availability` only models recurring weekly hours. "Doctor leave / bulk-reschedule handling" is correctly out of scope, but a single ad-hoc closed day (conference, appointment, sick day) has no mechanism at all — patients could book into a day the clinic is actually closed.

**Resolution:** Add a minimal one-off closures table — separate from `doctor_availability`, and deliberately not a bulk-leave/recurring-exception system:

```sql
create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);
```

Slot-generation logic (Phase 3+) checks this table and excludes any date present in it entirely, in addition to the weekly `doctor_availability` pattern. Write access mirrors `doctor_availability` — doctor only.

**Explicitly still out of scope:** recurring leave patterns, partial-day closures, bulk date ranges. This table only ever removes single, whole days.

**Section amended:** Section 3, Out of Scope — reword *"Doctor leave / bulk-reschedule handling"* to *"Doctor leave / bulk-reschedule handling (recurring or multi-day) — a minimal single-day closure mechanism exists (see Addendum A.3) for one-off unavailability, but planned or extended leave still requires manual coordination outside the system."*

---

## A.4 — SMS reminder trigger mechanism (undecided, not deferred)

**Gap:** Section 9 says a reminder is sent via "a receptionist action (or scheduled job)" — that "or" was never resolved. A receptionist action cannot produce a reminder fired at exactly T-minus-24-hours for an arbitrary future appointment; only a scheduled job can.

**Resolution:** Use `pg_cron` (a Postgres extension Supabase supports natively) running a scheduled function that queries for `CONFIRMED` appointments starting in ~24 hours and triggers the Semaphore SMS call for each. This keeps the scheduling logic inside the same local database rather than introducing an external cron service — consistent with the existing design philosophy of avoiding unnecessary external dependencies (the same reasoning that ruled out Google Calendar in Section 3).

**Section amended:** Section 9, SMS Notifications row — add: *"Reminder scheduling implemented via `pg_cron` querying confirmed appointments ~24h out; not a receptionist-triggered action."* This becomes a concrete decision for whichever future phase builds SMS integration, rather than something that phase has to first figure out from scratch.

---

## A.5 — Unmarked attendance silently corrupts the no-show report

**Gap:** FR 6b lets the receptionist mark `ATTENDED`/`NO_SHOW`, but nothing requires it happen. An appointment whose `attendance` stays `null` forever is counted as neither in FR9's no-show rate report — understating the exact problem the system exists to surface.

**Resolution:** A `CONFIRMED` appointment whose `appointment_date` has passed with `attendance` still `null` is treated as `NO_SHOW` for **reporting purposes**. Two implementation options, either acceptable:
- (a) the same `pg_cron` job from A.4 sets `attendance = 'NO_SHOW'` automatically once the date passes with no mark, or
- (b) leave the underlying data untouched and have the report query itself treat `null` + past-date as a no-show at query time, without writing to the row.

(b) is slightly safer — it doesn't put words in the receptionist's mouth by writing a status they never actually confirmed — and is the recommended default unless there's a reason to want it reflected in the raw data.

**Section amended:** FR 9 — add: *"9a. An appointment past its scheduled date with no attendance mark is treated as a no-show for reporting purposes (not written to the record unless explicitly marked by the receptionist)."*

---

## Summary of concrete follow-ups this creates

| Item | Type | When |
|---|---|---|
| `patients.profile_id` partial unique constraint | Migration | Before Phase 3 |
| `availability_exceptions` table + RLS | Migration | Before Phase 3 (slot-conflict logic needs to check it) |
| Receptionist phone-number dedup check | UI behavior note | Whichever phase builds patient registration |
| `pg_cron` reminder job | New logic | Phase 7 (SMS), per corrected numbering |
| No-show default-on-report-query | Report query logic | Phase 8 (Reports), per corrected numbering |
