-- Phase 1 — Project Scaffold + Database Schema
-- Per /specs/phase-1-project-scaffold-database-schema.md §2

-- 2.1 Enums -----------------------------------------------------------------

create type user_role as enum ('patient', 'doctor', 'receptionist');
create type appointment_status as enum ('PENDING', 'CONFIRMED', 'CANCELLED');
create type attendance_status as enum ('ATTENDED', 'NO_SHOW');
create type appointment_source as enum ('online', 'walk_in');
create type payment_method as enum ('cash', 'gcash');
create type sms_type as enum ('confirmation', 'reminder');
create type sms_status as enum ('sent', 'failed');

-- 2.2 Tables ----------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  address text,
  created_at timestamptz not null default now()
);

create index idx_patients_phone on patients(phone);

create table doctor_availability (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int not null default 30,
  is_active boolean not null default true,
  check (start_time < end_time)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete restrict,
  appointment_date date not null,
  appointment_time time not null,
  reason text,
  source appointment_source not null,
  status appointment_status not null default 'PENDING',
  attendance attendance_status,
  payment_reference text,
  payment_method payment_method,
  handled_by uuid references profiles(id), -- receptionist who approved/registered it
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_date on appointments(appointment_date);
create index idx_appointments_patient on appointments(patient_id);

-- Slot-conflict prevention (FR 3, 3a, 6a) — enforced at the DB level.
-- Partial unique index: cancelled appointments must not permanently block a slot.
create unique index uq_appointments_slot
  on appointments (appointment_date, appointment_time)
  where status <> 'CANCELLED';

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

create table sms_logs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  type sms_type not null,
  status sms_status not null,
  provider_response text,
  sent_at timestamptz not null default now()
);

create index idx_sms_logs_appointment on sms_logs(appointment_id);

-- 2.3 Row-Level Security — enabled now, policies deferred to Phase 2 --------

-- Explicit grants matching hosted-Supabase defaults. Newer local CLI versions
-- do NOT auto-grant Data API roles access to new tables (auto_expose_new_tables
-- unset), so grant them here. With RLS enabled and zero policies below,
-- anon/authenticated remain effectively locked out; service_role bypasses RLS.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter table profiles enable row level security;
alter table patients enable row level security;
alter table doctor_availability enable row level security;
alter table appointments enable row level security;
alter table sms_logs enable row level security;
