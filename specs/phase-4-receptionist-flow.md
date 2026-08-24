# Phase 4 — Receptionist Flow

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 3 entry (real repo state) — `getAvailableSlots`, `createAppointment`, `findOrCreatePatient` exist and are tested via harness mirrors + the live `/api/available-slots` route (per Phase 3's known issue: `createAppointment` and `findOrCreatePatient` themselves haven't been directly executed by anything yet).
**Feeds into:** Phase 5 (Patient booking flow) reuses this phase's login page and auth guard pattern. Phase 6 (Doctor schedule view) reuses the role-guard pattern too.

---

## 0. Objective

This is the first phase with real UI, and the first phase where `createAppointment` and `findOrCreatePatient` (built in Phase 3, exercised so far only via harness mirrors) actually run as the modules they are. Treat the walk-in booking flow's manual test with real scrutiny — it's simultaneously the first UI test *and* the first genuine integration test those two functions have had.

By the end of this phase:

- A shared login page exists that any role can use; the app routes them to the right place afterward.
- A receptionist can: see and act on pending online requests, register and book a walk-in on the spot, and mark attendance / cancel on existing appointments — the three responsibilities called out for this role in the stakeholder table.
- All of this is enforced at two layers, not one: a page-level role guard for a clean UX (redirect, not a raw 403), and Phase 2's RLS policies as the actual authority underneath it. If the guard were ever buggy or bypassed, the database still refuses the write.

---

## 1. Shared auth UI (built here, reused by Phase 5/6)

### 1.1 `src/app/login/page.tsx`

A single email/password form — no role selector (role isn't something the person logging in gets to declare; it's already fixed in `profiles.role` from signup, per Phase 2 §1). On success, redirect by role: `doctor` → `/doctor`, `receptionist` → `/receptionist`, `patient` → `/patient`. Errors (wrong password, etc.) surface inline — no need to distinguish "wrong password" from "no such account" in the message, standard practice to not leak which one it was.

### 1.2 `src/lib/auth/require-role.ts`

```ts
export async function requireRole(allowed: UserRole[]): Promise<Profile>
```

Server-side only. Reads the session via `server.ts`'s cookie-bound client, loads the profile via Phase 2's `getCurrentProfile()`. No session → redirect `/login`. Session but wrong role → redirect to that role's own home (a receptionist hitting `/doctor` lands on `/receptionist`, not an error page — there's no ambiguity about where they should be). Called at the top of each protected layout.

### 1.3 `src/app/receptionist/layout.tsx`

Wraps every page under `/receptionist` with `requireRole(['receptionist'])`. This is the UX-layer gate; §0 already flagged that RLS is the layer that actually matters if this one is ever wrong.

---

## 2. New shared logic (extends Phase 3's modules)

### 2.1 `src/lib/booking/create-appointment.ts` — extended, not replaced

Phase 3 shipped this with `patientId / appointmentDate / appointmentTime / reason / source / handledBy`. Add three **optional** fields, defaulting to Phase 3's existing behavior so nothing already tested breaks:

```ts
status?: 'PENDING' | 'CONFIRMED';   // default 'PENDING'
paymentMethod?: 'cash' | 'gcash';
paymentReference?: string;
```

**Why this needs extending here, not left as-is:** a walk-in patient is standing at the desk — per Addendum A.2, only the *online* path requires the async "receptionist follows up later" pattern. A walk-in's payment and confirmation happen in the same motion as booking, so the receptionist's walk-in form should be able to create the appointment as `CONFIRMED` with payment fields set directly, in one call, rather than insert-then-immediately-update. Phase 2's `appointments_insert_staff` policy already permits a receptionist to insert any status — this was allowed at the RLS layer since Phase 2 and simply hadn't been used yet.

### 2.2 `src/lib/booking/update-appointment.ts` — new

Three small functions, same dependency-injection shape as Phase 3's modules (caller passes their own RLS-bound `supabase` client — testable the same way Phase 2/3's harnesses tested things, by signing in as a real receptionist and calling these directly):

```ts
confirmAppointment(supabase, { appointmentId, paymentMethod, paymentReference })
  // sets status = 'CONFIRMED', writes payment fields — for approving an online PENDING request

rejectAppointment(supabase, { appointmentId })
  // sets status = 'CANCELLED' — for declining an online PENDING request

markAttendance(supabase, { appointmentId, attendance: 'ATTENDED' | 'NO_SHOW' })
  // writes the attendance column on a past/current CONFIRMED appointment
```

No app-level role check inside these functions — they rely entirely on `appointments_update_staff` (Phase 2) to reject the call if the session isn't a receptionist's. This is deliberate, not an oversight: the page-level guard (§1.3) is for UX, RLS is the actual authority, and duplicating the role check inside the function would just be two places that could drift out of sync with each other.

**No new "reschedule" mechanism.** Rescheduling an existing appointment is achieved by canceling it (`rejectAppointment`, despite the name — it's the same "set to CANCELLED" operation either way, consider renaming to `cancelAppointment` if the "reject vs cancel" distinction bothers you conceptually) and creating a new one at the desired slot via the walk-in form. Building a dedicated reschedule flow would duplicate logic that already exists and works; not worth it for this scope.

---

## 3. Receptionist dashboard

One page, `src/app/receptionist/page.tsx`, three tabs (shadcn `Tabs` — add via `npx shadcn@latest add tabs dialog textarea sonner`; `dialog` for the confirm-payment modal, `sonner` for action feedback toasts). A single page with tabs is simpler to build and reason about than three separate routes for a dashboard this size, and nothing about the three sections needs its own URL.

### 3.1 Tab: Pending Requests

Lists `appointments` where `status = 'PENDING' AND source = 'online'`, joined to `patients` for name/phone. Each row: requested date/time, reason, patient contact info, two actions:
- **Confirm** — opens a small dialog to enter payment method + reference, calls `confirmAppointment`.
- **Reject** — calls `rejectAppointment` (a confirm-are-you-sure step, no reason field needed — not required by any FR).

**Note for testing:** no patient-facing booking UI exists yet (that's Phase 5) — there's currently no real way for a `PENDING`/`online` row to exist except by creating one directly. Use Phase 3's `createAppointment` (already tested) to seed a test request before checking this tab renders and acts on it correctly.

### 3.2 Tab: Walk-in Registration

1. Phone number input → calls Phase 3's `/api/patients/find-or-create` route (already built, already gated to authenticated sessions — reused as-is, no new patient-lookup code needed here since a receptionist session is just as valid a caller as any other authenticated one).
2. Name/contact fields — pre-filled if the phone matched an existing record, editable either way.
3. Date picker (the shadcn `Calendar` from Phase 1) → on date select, fetch `/api/available-slots?date=...` (Phase 3's route) and render the open times.
4. Reason (optional), payment method + reference (required — this is the immediate-payment walk-in path from §2.1).
5. Submit → `createAppointment` with `source: 'walk_in'`, `status: 'CONFIRMED'`, `handledBy` set to the receptionist's own profile id, plus the payment fields.

### 3.3 Tab: Appointments

A filterable table (status filter: all/pending/confirmed/cancelled; date filter) of all appointments — receptionist has full read access per Phase 2. Row actions depend on status: `CONFIRMED` rows whose date has passed or is today get "Mark Attended" / "Mark No-Show" buttons (`markAttendance`); any non-cancelled row gets a "Cancel" button (`rejectAppointment`).

---

## 4. Test Cases

**Automated (`scripts/test-phase4.ts`), same real-session pattern as Phase 2/3 — sign in as the seeded receptionist, call the lib functions directly:**

1. `confirmAppointment` on a seeded `PENDING`/online row sets `status = 'CONFIRMED'` and both payment fields correctly.
2. `rejectAppointment` sets `status = 'CANCELLED'`.
3. `markAttendance` writes `ATTENDED` and, separately, `NO_SHOW` correctly on a `CONFIRMED` row.
4. `createAppointment` with `status: 'CONFIRMED'` + payment fields (the §2.1 extension) creates a row correctly in one call, without going through `PENDING` first.
5. **Defense-in-depth check:** the same three update functions, called with a *patient's* session instead of the receptionist's, are rejected by RLS — confirming the page-level guard isn't the only thing standing between a patient and these actions.
6. Existing Phase 3 tests (harness or route-based) still pass unmodified — confirms the `create-appointment.ts` extension didn't change default behavior for the online path.

**Manual, browser-based (this is where `createAppointment` and `findOrCreatePatient` get their first real, non-mirrored exercise — per the objective in §0, don't rush this):**

7. Log in as the seeded receptionist, land on `/receptionist`.
8. Log in as the seeded doctor or a patient account, confirm redirect away from `/receptionist` (role guard works both directions — right role in, wrong role out).
9. Full walk-in flow through the actual form: new phone number → creates a new patient; a phone number matching an existing walk-in → reuses it (this is `findOrCreatePatient` running for real, not the harness mirror — the exact gap flagged in Phase 3's known issues).
10. Pending Requests tab correctly confirms/rejects a seeded test request end to end, including the payment dialog.
11. Appointments tab attendance-marking and cancel buttons work and reflect immediately (or after a refresh — no hard requirement on live updates for this scope).

---

## 5. Explicitly deferred to later phases

- Patient-facing booking UI (Phase 5) — this phase can only be tested against manually-seeded `PENDING` requests until then.
- Doctor schedule view (Phase 6).
- Actual SMS sending on confirm/reject (Phase 7) — confirming here updates the DB only; no message goes out yet. Worth a visible "no SMS sent (not yet implemented)" note in the confirm dialog's UI copy so this isn't mistaken for a bug during testing.
- Reports (Phase 8) — the Appointments tab here is an operational tool, not FR9's reporting view.

---

## 6. Handoff notes for OpenCode plan mode

- **Resolve the Phase 3 harness gap here if it's low-effort, don't force it if not.** Phase 3's known issues flagged that its harness mirrors `create-appointment.ts`/`find-or-create-patient.ts` rather than importing them, because `tsx` doesn't resolve the `@/*` path alias. If wiring path-alias resolution into `scripts/test-phase4.ts` (e.g. `tsconfig-paths`, or a newer `tsx` version with native support) is quick, do it and have this phase's harness import the real modules directly — better than adding a fourth mirror. If it turns out to be a rabbit hole, don't burn the phase on it; the manual browser tests in §4 provide real coverage of those modules either way, just not automated coverage.
- The `create-appointment.ts` extension in §2.1 is additive only — if plan mode's diff shows any change to the existing required fields or Phase 3's default behavior, that's a regression, not a valid implementation of this spec.
- Three tabs, one page, no new routes beyond the login page — if plan mode starts proposing separate `/receptionist/queue`, `/receptionist/walk-in`, etc. pages, that's added complexity this spec didn't ask for; flag it back rather than building it.
