# Phase 2 — Auth + Role-Based Access

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 1 entry (real repo state, not the Phase 1 spec's assumptions) — project_id `Clinic_Appointment_System`, Postgres 17, tables `profiles / patients / doctor_availability / appointments / sms_logs`, RLS already enabled with zero policies.
**Feeds into:** Phase 3 (booking flow — slot generation, conflict handling in the app layer, now that requests can be attributed to a real patient identity).

**Correcting a tracking discrepancy noted in the Phase 1 changelog:** `progress.md` currently lists Phase 2 as "Slot-conflict logic." That's wrong — the DB-level half of slot-conflict (`uq_appointments_slot`) is already done, and what's left of it is application logic that needs to know *who* is booking, which requires this phase first. `progress.md` should read **Phase 2 — Auth + role-based access**, matching the original spec's ordering. I don't have `progress.md`'s current contents to edit directly — paste it in and I'll fix the line, or have OpenCode update it as part of this phase's changelog entry.

---

## 0. Objective

Wire up Supabase Auth so every request can be attributed to a real identity with a real role, and replace Phase 1's "RLS enabled, zero policies, default-deny" state with actual per-role policies on all 5 tables. By the end of this phase:

- Patients can self-register (Supabase Auth signup) and always land with `role = 'patient'` — there is no way for a public signup to grant itself `doctor` or `receptionist`.
- Doctor and receptionist accounts exist only because they were deliberately created by a service-role script — there is no public path to those roles.
- Each table's policies match Section 2/4 of the Master Handoff: patients see only their own records, receptionists see/manage everything, doctors see patients (read-only) and only `CONFIRMED` appointments, walk-ins stay invisible to patient tokens, and nobody — not even a receptionist — can hard-delete a patient or appointment row (cancellation is a status update, preserving the record).
- A patient cannot escalate their own role by directly updating `profiles`, even though they can update their own row for legitimate fields.

Still out of scope: actual dashboard pages, the booking form, slot-generation logic, SMS. This phase is identity + access control only.

---

## 1. Auth architecture & role-assignment (the part worth getting right)

**The core security decision this phase hinges on:** Supabase's `signUp()` lets the *caller* set `user_metadata` (`options.data`), but only an admin/service-role call can set `app_metadata`. If role assignment reads from `user_metadata`, any anonymous visitor can call `signUp({ data: { role: 'receptionist' } })` and grant themselves front-desk access. So:

- The new-user trigger (below) reads role from **`raw_app_meta_data`**, never `raw_user_meta_data`.
- Patients self-registering through the public signup form never touch `app_metadata` — the trigger defaults them to `'patient'` when it's absent, which is always, for that path.
- Doctor and receptionist accounts are created exclusively via a local seed script using the **service-role** client's `auth.admin.createUser()`, which explicitly sets `app_metadata: { role: 'doctor' | 'receptionist' }`. There is no in-app UI for creating staff accounts in this phase or any planned phase — a 3-person clinic doesn't need one, and not building it removes an entire attack surface.
- As defense-in-depth beyond the trigger, a second trigger blocks any `UPDATE` on `profiles.role` unless the request is running as `service_role` — so even direct table access (not just the signup path) can't be used to self-promote.

---

## 2. Migration: `supabase/migrations/<timestamp>_phase2_auth_rls.sql`

Generate with `npx supabase migration new phase2_auth_rls`.

### 2.1 Role-resolution helper (avoids RLS self-recursion)

Policies on `profiles` that need to check "is this caller staff?" can't safely query `profiles` directly inside their own policy — that's a classic recursive-RLS trap. `get_my_role()` is `security definer`, so it reads `profiles` as its owner, bypassing RLS for just that one lookup:

```sql
create or replace function public.get_my_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;
```

### 2.2 New-user trigger (role from `app_metadata`, defaults to patient)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role user_role;
begin
  assigned_role := coalesce(
    (new.raw_app_meta_data->>'role')::user_role,
    'patient'
  );
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    assigned_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Note `full_name`/`phone` are pulled from `user_metadata` (client-settable — fine, they're not privileged) while `role` is pulled from `app_metadata` (not client-settable).

No `INSERT` RLS policy is created for `profiles` — the trigger is `security definer`, so it doesn't need one, and *not* adding one means nothing else can insert a `profiles` row directly. That's intentional.

### 2.3 Role anti-escalation trigger

```sql
create or replace function public.prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and auth.role() <> 'service_role' then
    raise exception 'role cannot be changed directly';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_change
  before update on profiles
  for each row execute function public.prevent_role_change();
```

### 2.4 RLS policies

**`profiles`**

```sql
create policy "profiles_select_own" on profiles
  for select to authenticated using (id = auth.uid());

create policy "profiles_select_staff" on profiles
  for select to authenticated using (public.get_my_role() in ('doctor', 'receptionist'));

create policy "profiles_update_own" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
```

**`patients`**

```sql
create policy "patients_select_own" on patients
  for select to authenticated using (profile_id = auth.uid());

create policy "patients_select_staff" on patients
  for select to authenticated using (public.get_my_role() in ('doctor', 'receptionist'));

create policy "patients_insert_own" on patients
  for insert to authenticated with check (profile_id = auth.uid());

create policy "patients_insert_staff" on patients
  for insert to authenticated with check (public.get_my_role() = 'receptionist');

create policy "patients_update_own" on patients
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "patients_update_staff" on patients
  for update to authenticated using (public.get_my_role() = 'receptionist');
```

Walk-ins (`profile_id = null`, created by a receptionist) are only ever touched by the staff policies — `profile_id = auth.uid()` can never match `null` for a real logged-in user, so a patient token has no path to a walk-in row.

No `DELETE` policy on `patients` — not even for the receptionist. There's no functional requirement calling for hard-deleting a patient, and not building the capability is simpler than building it and then having to reason about what happens to their appointment history.

**`doctor_availability`**

```sql
create policy "availability_select_authenticated" on doctor_availability
  for select to authenticated using (true);

create policy "availability_write_doctor" on doctor_availability
  for all to authenticated
  using (public.get_my_role() = 'doctor')
  with check (public.get_my_role() = 'doctor');
```

Any authenticated user can read availability (a patient needs to see open slots to book), but only the doctor can write it — matches the stakeholder table's "Doctor sets availability/working hours." The receptionist manages *appointments*, not the doctor's working hours.

**`appointments`**

```sql
create policy "appointments_select_own" on appointments
  for select to authenticated using (
    patient_id in (select id from patients where profile_id = auth.uid())
  );

create policy "appointments_select_staff" on appointments
  for select to authenticated using (public.get_my_role() = 'receptionist');

create policy "appointments_select_doctor" on appointments
  for select to authenticated using (
    public.get_my_role() = 'doctor' and status = 'CONFIRMED'
  );

create policy "appointments_insert_own" on appointments
  for insert to authenticated with check (
    source = 'online'
    and status = 'PENDING'
    and patient_id in (select id from patients where profile_id = auth.uid())
  );

create policy "appointments_insert_staff" on appointments
  for insert to authenticated with check (public.get_my_role() = 'receptionist');

create policy "appointments_update_staff" on appointments
  for update to authenticated
  using (public.get_my_role() = 'receptionist')
  with check (public.get_my_role() = 'receptionist');
```

Two things worth being explicit about:

- **The doctor only ever sees `CONFIRMED` appointments** — matches FR7 exactly ("view a daily/weekly schedule of confirmed appointments"), not a broader "all appointments" grant that would've been easier to write but wrong per spec.
- **No `UPDATE` policy for patients at all.** This is the DB-level enforcement of "only the Receptionist can reschedule/cancel" (Section 3/11) — a patient's own-appointment `INSERT` policy exists so they can submit a request, but once it exists, only a receptionist token can touch it. There's also no `DELETE` policy anywhere on this table — cancellation is `status = 'CANCELLED'`, never a removed row, which is what keeps the no-show/reporting history (FR9) intact.

**`sms_logs`**

```sql
create policy "sms_logs_select_receptionist" on sms_logs
  for select to authenticated using (public.get_my_role() = 'receptionist');
```

Receptionist-only — the stakeholder table gives report-viewing to the Receptionist, not the Doctor. No insert/update/delete policy for any client role; the SMS-sending logic (a later phase) writes here via the service-role client, which bypasses RLS entirely.

### 2.5 One thing to verify, not assume

Postgres grants `EXECUTE` on new functions to `PUBLIC` by default, so `get_my_role()` should be callable from RLS policies without an explicit `GRANT`. Phase 1's changelog already turned up one surprise around default grants having changed in a newer Supabase CLI version — if any policy above fails with "permission denied for function" during testing, that's the first thing to check, not a sign the policy logic is wrong.

---

## 3. App-layer pieces

### 3.1 Session-refresh middleware

Add `src/middleware.ts` using the standard `@supabase/ssr` pattern — reads/refreshes the auth cookie on every request so server components always see a valid session:

```
src/middleware.ts          → calls the helper below, matches all routes except static assets/_next
src/lib/supabase/middleware.ts   → updateSession(request) — creates a server client bound to
                                     the request/response cookies, calls getUser() to force a
                                     refresh if needed, returns the response
```

Matcher config should exclude `_next/static`, `_next/image`, favicon, and public image extensions — no need to run auth refresh logic on asset requests.

### 3.2 Current-user helper

`src/lib/auth/get-profile.ts` — a small server-side helper, `getCurrentProfile()`, that reads the session via `server.ts` and returns `{ id, role, full_name, phone } | null`. This is what Phase 3's role-gated pages will build on; Phase 2 just needs it to exist so the test cases below have something to call.

Not building yet: actual `requireRole()` route guards or protected pages — there's nothing to protect until Phase 3 has pages.

### 3.3 Local staff-seeding script

`scripts/seed-staff.ts`, run manually (`npx tsx scripts/seed-staff.ts`) against the local stack — not part of the migration, since creating `auth.users` rows correctly (password hashing, etc.) should go through GoTrue's admin API, not a raw SQL insert:

```ts
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  await admin.auth.admin.createUser({
    email: "doctor@clinic.local",
    password: "dev-password-only",
    email_confirm: true,
    app_metadata: { role: "doctor" },
    user_metadata: { full_name: "Dr. Test", phone: "+639170000001" },
  });

  await admin.auth.admin.createUser({
    email: "receptionist@clinic.local",
    password: "dev-password-only",
    email_confirm: true,
    app_metadata: { role: "receptionist" },
    user_metadata: { full_name: "Front Desk Test", phone: "+639170000002" },
  });
}

seed();
```

The `handle_new_user` trigger fires the same as it would for any signup and creates matching `profiles` rows with the correct roles — no separate insert needed. These are local-dev-only throwaway credentials; nothing about this script should ever run against a non-local project.

---

## 4. Test Cases

Run against the local stack after `supabase db reset` + `npx tsx scripts/seed-staff.ts`. Where a test needs to act "as" a specific user, sign in with `supabase.auth.signInWithPassword()` (for the seeded staff) or `signUp()` (for a fresh patient) using the anon client, then make the query with that session's client — this exercises the real RLS path through PostgREST, not a service-role shortcut.

1. **Public signup defaults to patient** — `signUp()` with no `app_metadata` → resulting `profiles` row has `role = 'patient'`.
2. **Public signup cannot self-elevate** — `signUp({ data: { role: 'receptionist' } })` → resulting role is still `'patient'` (proves `user_metadata` is correctly ignored for role assignment).
3. **Seeded staff get correct roles** — after running the seed script, the doctor and receptionist accounts' `profiles.role` match what was passed to `app_metadata`.
4. **Patient can't read another patient** — Patient A's session querying `patients` for Patient B's `id` returns empty, not an error and not the row.
5. **Patient can insert their own patient + appointment rows** — succeeds when `patient_id` resolves to their own `profile_id`, `source = 'online'`, `status = 'PENDING'`.
6. **Patient insert is rejected outside those constraints** — attempting `source = 'walk_in'` or `status = 'CONFIRMED'` as a patient fails the `WITH CHECK`.
7. **Patient cannot update or cancel their own appointment** — an `UPDATE` from the patient's session on their own appointment row is rejected (no policy permits it — receptionist-only, by design).
8. **Receptionist has full read/write on `patients` and `appointments`**, including creating a walk-in patient with `profile_id = null`.
9. **Doctor sees only `CONFIRMED` appointments** — a `PENDING` or `CANCELLED` row is invisible to the doctor's session; a `CONFIRMED` one is visible. Doctor's `INSERT`/`UPDATE` attempts on `appointments` fail.
10. **Doctor can write `doctor_availability`; receptionist cannot** — doctor's insert/update succeeds, receptionist's is rejected.
11. **`sms_logs` is receptionist-only** — patient and doctor sessions get empty/denied on select; no role can insert via the client (only service-role, untested here since it's not wired up until the SMS phase).
12. **Role escalation via direct update is blocked** — a patient session running `update profiles set role = 'doctor' where id = auth.uid()` raises the trigger's exception, not a silent success.
13. **Middleware doesn't break unauthenticated requests** — loading any route as a signed-out visitor doesn't throw; the session helper just returns null cleanly.

If any test fails, this is where OpenCode's retry policy applies (same repo state, same spec, capped at 2 attempts before escalating back here).

---

## 5. Explicitly deferred to later phases

- Any actual dashboard/booking UI — this phase only proves access control works, not what's built on top of it.
- Slot-generation logic turning `doctor_availability` rows into a bookable list of times for a given date (Phase 3, per the note at the top of this doc).
- `requireRole()`-style page guards — nothing to guard yet.
- Password reset / email verification flows — out of scope for a 3-role, ~5-person-total user base in a course project; the seeded staff accounts use `email_confirm: true` specifically to skip needing a working email provider locally.

---

## 6. Handoff notes for OpenCode plan mode

- This phase adds **no new tables** — only functions, triggers, and policies on Phase 1's existing 5 tables. Table-level `GRANT`s from Phase 1's deviation #3 already cover this; don't re-add them.
- The one design judgment call worth flagging back if plan mode disagrees: `app_metadata` vs `user_metadata` for role assignment (Section 1). This is a security-load-bearing decision, not a style choice — if plan mode proposes reading role from `user_metadata` for convenience, that's a divergence to reconcile with me before build mode runs, not something to quietly "fix later."
- Everything in Section 2 goes in one migration file, same reasoning as Phase 1.
