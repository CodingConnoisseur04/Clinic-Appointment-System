-- Phase 2 — Auth + Role-Based Access
-- Per /specs/phase-2-auth-role-based-access.md §2
-- No new tables; functions, triggers, and RLS policies on Phase 1's tables.

-- 2.1 Role-resolution helper (avoids RLS self-recursion) --------------------

create or replace function public.get_my_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 2.2 New-user trigger (role from app_metadata, defaults to patient) --------

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

-- Intentionally no INSERT policy on profiles: the security definer trigger
-- doesn't need one, and its absence means nothing else can insert directly.

-- 2.3 Role anti-escalation trigger -------------------------------------------

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

-- 2.4 RLS policies -----------------------------------------------------------

-- profiles
create policy "profiles_select_own" on profiles
  for select to authenticated using (id = auth.uid());

create policy "profiles_select_staff" on profiles
  for select to authenticated using (public.get_my_role() in ('doctor', 'receptionist'));

create policy "profiles_update_own" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- patients
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

-- No DELETE policy on patients — hard-deleting a patient is never permitted.

-- doctor_availability
create policy "availability_select_authenticated" on doctor_availability
  for select to authenticated using (true);

create policy "availability_write_doctor" on doctor_availability
  for all to authenticated
  using (public.get_my_role() = 'doctor')
  with check (public.get_my_role() = 'doctor');

-- appointments
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

-- No UPDATE policy for patients: only a receptionist token can touch an
-- existing appointment. No DELETE policy anywhere: cancellation is a status.

-- sms_logs (receptionist-only select; SMS phase writes via service-role,
-- which bypasses RLS)
create policy "sms_logs_select_receptionist" on sms_logs
  for select to authenticated using (public.get_my_role() = 'receptionist');
