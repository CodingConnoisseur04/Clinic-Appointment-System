-- Phase 3 — Slot-Conflict Logic (App Layer): schema pieces
-- Per /specs/phase-3-slot-conflict-logic.md §1

-- 1.1 Addendum A.1 — patient uniqueness: one patients row per linked profile.
-- Partial so walk-ins (profile_id = null) can still repeat.
create unique index uq_patients_profile_id
  on patients (profile_id)
  where profile_id is not null;

-- 1.2 Addendum A.3 — one-off closures (single whole days only)
create table availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  reason text,
  created_at timestamptz not null default now()
);

alter table availability_exceptions enable row level security;

-- New tables get no automatic PostgREST grants on this CLI version
-- (see Phase 1 changelog deviation #3): grant explicitly here.
grant all on availability_exceptions to anon, authenticated, service_role;

create policy "exceptions_select_authenticated" on availability_exceptions
  for select to authenticated using (true);

create policy "exceptions_write_doctor" on availability_exceptions
  for all to authenticated
  using (public.get_my_role() = 'doctor')
  with check (public.get_my_role() = 'doctor');
