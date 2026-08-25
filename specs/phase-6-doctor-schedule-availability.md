# Phase 6 — Doctor Schedule View & Availability Management

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 5 entry (real repo state) — shared `<SlotPicker>` exists and is used by both patient and receptionist forms; `/doctor` doesn't exist yet (a logged-in doctor currently 404s the same way `/patient` did before Phase 5).
**Feeds into:** Phase 7 (SMS) and Phase 8 (Reports) are the last two feature phases; Phase 9 is deployment. This phase is local-only like everything before it — no need to pre-optimize for the local→remote transition here, Phase 9 handles that explicitly.

---

## 0. Correction from what was said going into this phase

This was described as "read-only" before writing it out — that's wrong. FR7 covers two distinct responsibilities: the doctor **views** the confirmed schedule (read-only, that part's accurate) and **sets availability/working hours** (a real write, to two tables that have had RLS write permissions sitting unused since Phase 2 and Phase 3). Both need UI here.

---

## 0.1 Objective

By the end of this phase:

- A doctor logs in and lands on `/doctor`, seeing their confirmed appointments for today or the week — read-only, patient info visible (name/phone/reason), nothing editable here.
- The same doctor can edit their weekly working hours (`doctor_availability`, seeded in Phase 1, never touched by UI since) and add/remove one-off closed dates (`availability_exceptions`, built in Phase 3, also never touched by UI since).
- Adding a closure here is verifiably the same closure Phase 3's `getAvailableSlots` already respects — this phase doesn't reimplement that check, it just gives the doctor a way to populate the table that logic already reads from.

---

## 1. `src/app/doctor/layout.tsx` and routing

`requireRole(['doctor'])`, identical pattern to Phase 4/5's layouts — third use of the same guard, nothing new here.

---

## 2. New shared logic

Same dependency-injection shape as every prior phase's lib modules — caller passes their own RLS-bound session, testable via harness the same way.

### 2.1 `src/lib/schedule/get-schedule.ts`

```ts
export async function getSchedule(
  supabase: SupabaseClient,
  range: { from: string; to: string }  // "YYYY-MM-DD"
): Promise<ScheduleEntry[]>
```

Queries `appointments` joined to `patients` for name/phone, filtered to the date range — `appointments_select_doctor`'s RLS policy (Phase 2) already restricts this to `status = 'CONFIRMED'` and doesn't scope by patient, so a doctor's own session returns every confirmed appointment across all patients directly. **No `admin.ts` route needed here**, unlike Phase 3's slot-availability problem — that route existed because a *patient's* RLS only shows their own rows; a doctor's RLS policy was deliberately built broader from the start, so this is a straightforward query through the doctor's own session.

### 2.2 `src/lib/availability/update-hours.ts`

```ts
updateWorkingHours(supabase, { id, startTime, endTime, isActive })
```

Updates a single `doctor_availability` row. Relies on Phase 2's `availability_write_doctor` policy for authorization — no in-function role check, same reasoning as Phase 4's update functions (§2.2 there): the page guard is UX, RLS is the authority.

### 2.3 `src/lib/availability/manage-exceptions.ts`

```ts
addException(supabase, { date, reason })
removeException(supabase, { id })
```

Insert/delete on `availability_exceptions`, relying on Phase 3's `exceptions_write_doctor` policy the same way.

**Conflict warning (non-blocking) — add this, don't skip it:** neither function should silently let a doctor close a date or shorten hours that already has confirmed appointments sitting in the newly-unavailable window. Not a hard stop — a real clinic's doctor being unavailable is a real-world coordination fact no validation can undo, and blocking the write doesn't help anyone. Instead, both functions should return a count of affected appointments alongside their success result:

```ts
// addException / updateWorkingHours both return:
{ success: true, conflictingAppointments: number }
```

Computed with a simple `count` query against `appointments` for `status = 'CONFIRMED'` on the affected date (for `addException`) or day-of-week within the now-excluded time range (for `updateWorkingHours`) — cheap, no new table or migration needed. The UI (§3.2) surfaces this as a plain warning before or after the save — e.g. *"2 confirmed appointments fall on this date — closing it won't cancel them automatically, check the schedule tab."* — not a blocking confirmation dialog, just a visible heads-up. The write still succeeds either way; this only makes an existing silent gap visible instead of fixing the gap itself, which is the right scope for this phase.

---

## 3. Doctor dashboard — `src/app/doctor/page.tsx`

Two tabs (shadcn `Tabs`, already installed since Phase 4 — third reuse):

### 3.1 Tab: Schedule

Today/This Week toggle (simple, not a full calendar view — a course-project doctor dashboard doesn't need more). Lists `getSchedule` results: time, patient name, phone, reason. Read-only — no action buttons on this tab at all; attendance-marking and cancellation are the receptionist's job (Phase 4), not duplicated here.

### 3.2 Tab: Manage Availability

**Weekly hours** — a small table, one row per `doctor_availability` entry (day of week, start time, end time, active toggle), each row editable inline with a save action calling `updateWorkingHours`.

**Closed dates** — a list of upcoming `availability_exceptions` (date, reason, delete button calling `removeException`) plus a small add-form (date picker — reuse the shadcn `Calendar` already in the codebase, reason text field) calling `addException`.

Both the hours-edit save and the add-closure submit should render `conflictingAppointments` (§2.2/2.3) as a plain inline warning when it's greater than 0 — a toast (sonner, already installed) is enough, no blocking dialog.

---

## 4. Test Cases

**Automated (`scripts/test-phase6.ts`), same real-session pattern as every prior phase:**

1. `getSchedule` on the doctor's session returns only `CONFIRMED` appointments in the given range, correctly joined to patient info.
2. `getSchedule` called with a receptionist or patient session is rejected by RLS, not just by the page guard.
3. `updateWorkingHours` succeeds for the doctor's session; fails for receptionist/patient sessions (RLS).
4. `addException` / `removeException` succeed for the doctor's session; fail for receptionist/patient sessions (RLS).
5. **The cross-phase check that actually matters:** after `addException` adds a closure for some future date, call Phase 3's `getAvailableSlots` for that same date directly — confirm it returns `[]`. This is the first time anything actually exercises the *write* side of the exceptions table Phase 3 built the *read* side for; up to now `availability_exceptions` rows only ever existed via direct SQL insert in a test.

6. `addException` on a date with an existing `CONFIRMED` appointment returns `conflictingAppointments: 1` (or more); on a date with none, returns `0`. The write succeeds in both cases — this only checks the reported count, not that anything was blocked.

**Manual, browser-based:**

7. Log in as the doctor, confirm landing on `/doctor` (resolves the current 404).
8. Schedule tab shows the confirmed appointment from Phase 5's Test 8 round-trip — already confirmed working, so this is a second, independent view of the same data from a third role's perspective.
9. Edit a working-hours row, confirm it saves and persists on refresh.
10. Add a closure for a near-future date, then check that date on the patient booking form (`/patient`) or receptionist walk-in form — confirm no slots are offered for it, closing the loop from Test 5 through the actual UI a real user would see, not just the underlying function call.
11. Add a closure on a date with an existing confirmed appointment (seed one via the receptionist walk-in form first if needed) — confirm the warning toast from §3.2 actually appears in the browser, not just in the automated Test 6 return value.
12. Log in as a patient or receptionist, confirm redirect away from `/doctor`.

---

## 5. Explicitly deferred to later phases

- SMS (Phase 7) — nothing here sends anything.
- Reports (Phase 8) — the schedule view here is operational, not FR9's reporting.
- Cross-checking availability edits against existing bookings (§2.2/2.3's known limitation) — not scheduled for a specific future phase, just flagged as a known gap.
- Deployment considerations (Phase 9) — this phase, like all before it, is built and tested against the local stack only.

---

## 6. Handoff notes for OpenCode plan mode

- **§2.1's "no `admin.ts` needed" reasoning is the one thing worth double-checking against Phase 2's actual policy text**, not assuming from this spec alone — if `appointments_select_doctor` was ever modified since Phase 2 closed in a way that scoped it more narrowly, this phase's simplicity assumption breaks and it'd need the same service-role route pattern Phase 3 used. Worth a quick read of the current migration state before writing `getSchedule`, not just trusting this spec's memory of Phase 2.
- Two tabs, one page, no new routes beyond what's listed — same "don't split into multiple pages" instruction as Phase 4, for the same reason (nothing here needs its own URL).
- If `db reset` was run since Phase 5 closed, remember the staff re-seed step before testing — same standing note as every phase since Phase 2.
