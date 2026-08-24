# Phase 3 — Slot-Conflict Logic (App Layer)

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 2 entry (real repo state) + `docs/master-handoff-addendum-a.md` (A.1, A.3 — assumed signed off; flag back if not)
**Feeds into:** Phase 4 (Receptionist flow) and Phase 5 (Patient booking flow) — both are thin UI layers over the shared functions this phase builds. Reused 3x per the original FR3/3a/6a note in `progress.md`: patient online booking, receptionist walk-in booking, and (indirectly) the doctor's read-only schedule view all depend on this phase's correctness.

---

## 0. Objective

This phase has no UI. It builds the shared, tested logic that Phases 4 and 5 will both call, so slot-conflict handling is written and verified exactly once instead of twice (once per flow) with two chances to diverge. By the end of this phase:

- Given a date, the system can compute the actual list of bookable time slots — accounting for weekly hours, already-booked (non-cancelled) appointments, and one-off closures.
- Creating an appointment goes through one shared function, used identically by the (future) online booking form and the (future) receptionist walk-in form, that turns a raw DB unique-violation into a typed, human-readable outcome instead of a generic 500.
- The patient-identity gap from Addendum A.1 is closed at the schema level, and the reconciliation behavior (reuse an existing record by phone match, rather than creating a duplicate) is implemented as a real function, not just a documented policy.
- The one-off closure gap from Addendum A.3 is closed — `availability_exceptions` exists, is respected by slot generation, and is doctor-writable only, mirroring `doctor_availability`'s existing policy shape.

---

## 1. Migration: `supabase/migrations/<timestamp>_phase3_slot_logic.sql`

Generate with `npx supabase migration new phase3_slot_logic`. **Naming note from Phase 2's deviation #2:** that migration's filename had to be manually corrected because `supabase migration new` stamped a UTC timestamp that sorted before a locally-generated one from Phase 1. Before this migration is finalized, confirm its timestamp is later than `20260823180000` (Phase 2's file) — don't assume the CLI's default output is safe without checking, the same way it wasn't last time.

### 1.1 Addendum A.1 — patient uniqueness

```sql
create unique index uq_patients_profile_id
  on patients (profile_id)
  where profile_id is not null;
```

Partial, not a plain unique constraint — multiple walk-ins with `profile_id = null` must remain allowed; only a non-null `profile_id` can't repeat.

### 1.2 Addendum A.3 — one-off closures

```sql
create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table availability_exceptions enable row level security;

create policy "exceptions_select_authenticated" on availability_exceptions
  for select to authenticated using (true);

create policy "exceptions_write_doctor" on availability_exceptions
  for all to authenticated
  using (public.get_my_role() = 'doctor')
  with check (public.get_my_role() = 'doctor');
```

Same read/write shape as `doctor_availability` (Phase 2, §2.4) — any authenticated user can see closures (needed to render "unavailable" on a booking calendar), only the doctor can create them. Reuses `get_my_role()` from Phase 2; no new helper function needed.

---

## 2. Shared logic modules

All server-only (imported into route handlers and, later, server actions — never into a client component, same discipline as `admin.ts`).

### 2.1 `src/lib/booking/get-available-slots.ts`

```ts
export type Slot = { time: string }; // "HH:MM", 24hr

export async function getAvailableSlots(
  supabase: SupabaseClient,   // caller passes either the RLS-bound server client
  date: string                 // "YYYY-MM-DD"
): Promise<Slot[]>
```

Logic, in order:
1. Query `availability_exceptions` for `exception_date = date`. If a row exists, return `[]` immediately — closed day, no further computation needed.
2. Derive `day_of_week` from `date`, query `doctor_availability` for that day where `is_active = true`. If none, return `[]`.
3. Generate the full candidate slot list from `start_time`/`end_time`/`slot_duration_minutes`.
4. Query `appointments` for `appointment_date = date` and `status <> 'CANCELLED'`; remove those times from the candidate list.
5. Return the remaining slots.

This function is called with the **caller's own RLS-bound client** (patient's session or receptionist's session — both have read access to `doctor_availability`, `availability_exceptions`, and, critically, enough of `appointments` to compute this correctly: a patient's `appointments` SELECT policy only shows their *own* rows, which is a problem — see §2.1.1.

**§2.1.1 — a real RLS interaction to resolve, not gloss over:** step 4 needs to know *all* booked slots on a date to exclude them, but a patient's session can only see their own appointments per Phase 2's `appointments_select_own` policy. If `getAvailableSlots` runs with the patient's client, step 4 silently under-counts other patients' bookings and will offer slots that are actually taken — the DB-level `uq_appointments_slot` constraint will still catch it at insert time (so nothing double-books), but the patient sees a wrong list and gets a confusing rejection after picking a slot that looked open.

**Resolution:** `getAvailableSlots` must run via a route handler using `admin.ts` (service-role), the same pattern Phase 1 established for the connectivity check — not because slot availability is sensitive data (it isn't; it's the same info a phone call to the clinic would give anyone), but because computing it correctly requires seeing every patient's booked times, which no single patient's RLS-scoped session can do. Expose this as `src/app/api/available-slots/route.ts?date=...`, called by both the (future) patient booking form and receptionist walk-in form — one endpoint, one source of truth, matching the "shared logic" objective above.

### 2.2 `src/lib/booking/create-appointment.ts`

```ts
export type CreateAppointmentInput = {
  patientId: string;
  appointmentDate: string;
  appointmentTime: string;
  reason?: string;
  source: 'online' | 'walk_in';
  handledBy?: string; // receptionist profile id, required for walk_in
};

export type CreateAppointmentResult =
  | { success: true; appointmentId: string }
  | { success: false; reason: 'SLOT_TAKEN' | 'CLOSED_DATE' | 'VALIDATION_ERROR'; message: string };
```

Logic:
1. Check `availability_exceptions` for the target date first — if closed, return `CLOSED_DATE` before attempting an insert (cheap, avoids a pointless round-trip that would fail anyway).
2. Attempt the insert via the **caller's own RLS-bound client** — a patient's own session for `source: 'online'` (their `appointments_insert_own` policy already enforces `status = 'PENDING'` and correct `patient_id`), a receptionist's session for `source: 'walk_in'`. This function does not use `admin.ts` — unlike slot-reading, the actual write should go through the real RLS policy path so a bug in this function can't accidentally bypass the access rules Phase 2 built.
3. Catch the specific Postgres unique-violation on `uq_appointments_slot` (error code `23505`, constraint name check) and translate it to `{ success: false, reason: 'SLOT_TAKEN' }` — this is the concrete implementation of "confirm the first validated submission, reject the later one" that the original design (FR3a) described as behavior without specifying mechanism. Any other error becomes `VALIDATION_ERROR` with the raw message attached for logging, not shown verbatim to the patient in a later phase's UI.

### 2.3 `src/lib/patients/find-or-create-patient.ts`

Implements Addendum A.1's reconciliation policy as code rather than leaving it as a manual receptionist habit:

```ts
export async function findOrCreatePatient(
  supabase: SupabaseClient,  // service-role — see below
  input: { phone: string; fullName: string; profileId?: string; email?: string; dateOfBirth?: string; address?: string }
): Promise<{ patientId: string; wasExisting: boolean }>
```

Logic:
1. Query `patients` by exact `phone` match.
2. If found and `profile_id` is currently `null` and `input.profileId` is provided — this is a walk-in who's now registering online — update the row to set `profile_id`, and return it (`wasExisting: true`). This is where `uq_patients_profile_id` (§1.1) actually gets exercised: the update can only proceed if that profile isn't already linked elsewhere.
3. If found and already linked to a *different* profile, or already linked to the same profile — return the existing row as-is; don't create a duplicate.
4. If not found — insert a new row.

**Needs the service-role client**, not the caller's session — a not-yet-registered patient has no `patients` row yet, so no RLS policy on `patients` would let their own session look one up by phone (the `patients_select_own` policy requires `profile_id = auth.uid()`, which doesn't help when searching *by phone* for a possibly-preexisting walk-in record). This function is the one deliberate, narrow exception to "route real writes through the caller's own RLS session" from §2.2 — the justification is that phone-based lookup is structurally impossible under RLS as designed, not a shortcut taken for convenience. Expose via `src/app/api/patients/find-or-create/route.ts`.

---

## 3. Test Cases

Extend `scripts/test-phase2.ts`'s pattern into a new `scripts/test-phase3.ts` — same real-session-through-PostgREST approach, not mocked.

1. **`uq_patients_profile_id` holds** — inserting a second `patients` row with a `profile_id` already in use fails with a unique-violation.
2. **`availability_exceptions` RLS matches `doctor_availability`'s shape** — doctor insert succeeds, receptionist insert fails, any authenticated read succeeds.
3. **`getAvailableSlots` on a normal weekday** returns the expected slot count/times from the seeded Mon–Fri 9–5, 30-min pattern.
4. **`getAvailableSlots` on an exception date** returns `[]`, even though the underlying day-of-week would normally have hours.
5. **`getAvailableSlots` excludes a booked, non-cancelled slot** and **re-includes a cancelled one** — the app-layer equivalent of Phase 1's DB-level Tests 5/6, confirming the function's own filtering logic matches the constraint it's built alongside.
6. **`getAvailableSlots` run through the `/api/available-slots` route (not a raw client call)** returns correct results even when the caller is an authenticated patient — proving §2.1.1's service-role resolution actually works and a patient session isn't silently under-counting other patients' bookings.
7. **`createAppointment` succeeds** for a valid online request and a valid walk-in.
8. **`createAppointment` returns `SLOT_TAKEN`, not a raw DB error**, when two calls target the same date/time — simulate with `Promise.all` on two concurrent calls, confirm exactly one succeeds and the other gets the typed rejection, not an unhandled exception.
9. **`createAppointment` returns `CLOSED_DATE`** before attempting an insert, when the target date is in `availability_exceptions`.
10. **`findOrCreatePatient` reuses a walk-in record** — create a walk-in (`profile_id: null`) by phone, then call `findOrCreatePatient` with the same phone and a real `profileId`; confirm it updates and returns the *same* `patientId`, not a new one.
11. **`findOrCreatePatient` creates new when no match exists.**
12. **End-to-end happy path** — a freshly-signed-up patient with no `patients` row yet: call `findOrCreatePatient`, then `createAppointment` using the returned `patientId`, confirm success end to end.

---

## 4. Explicitly deferred to later phases

- All UI — booking calendar, walk-in form, schedule view (Phases 4–6).
- `pg_cron` reminder job and no-show default-on-report-query (Addendum A.4/A.5 — Phases 7/8 per the addendum's own table).
- Payment reference collection/logging as part of the confirmation step (Addendum A.2 clarified *when* this happens; the actual receptionist confirmation UI that records it is a Phase 4 concern).

---

## 5. Handoff notes for OpenCode plan mode

- **§2.1.1 is the one judgment call worth flagging back if plan mode disagrees.** Routing slot-reads through `admin.ts` looks, at a glance, like the same admin.ts-in-a-route-handler pattern from Phase 1 — but the *reason* is different (Phase 1: RLS wasn't configured yet; here: RLS is configured correctly, but is structurally the wrong tool for a "read across all patients' bookings" query). If plan mode proposes reading slots directly from a patient's own session instead, that reintroduces the wrong-availability-list problem described in §2.1.1 — worth reconciling before build mode runs, not something to accept as a simplification.
- `findOrCreatePatient`'s service-role usage (§2.3) is the second deliberate exception to "writes go through the caller's session." Two exceptions in one phase is worth double-checking in review — if a third one seems to come up, that's a signal to ask whether the RLS policy shape from Phase 2 needs revisiting rather than adding another admin.ts workaround.
- No dashboards, no forms — if plan mode starts scaffolding UI for this phase, that's scope creep into Phase 4/5; keep it to the two route handlers and three lib modules above.
