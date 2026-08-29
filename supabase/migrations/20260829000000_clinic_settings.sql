-- Clinic-wide settings (key-value store for simple config).
-- Currently holds: receptionist_phone, clinic_name, etc.
create table clinic_settings (
  key   text primary key,
  value text not null
);

-- Grant table-level permissions to PostgREST roles
grant select on clinic_settings to anon;
grant select, insert, update, delete on clinic_settings to authenticated;

-- Seed with the existing placeholder phone from brand.ts
insert into clinic_settings (key, value)
values ('receptionist_phone', '(088) 000-0000');

-- RLS: anyone (including anon/landing page) can read; only receptionists can write
alter table clinic_settings enable row level security;

create policy "clinic_settings_select_anon"
  on clinic_settings for select to anon
  using (true);

create policy "clinic_settings_select_authenticated"
  on clinic_settings for select to authenticated
  using (true);

create policy "clinic_settings_insert_receptionist"
  on clinic_settings for insert to authenticated
  with check (public.get_my_role() = 'receptionist');

create policy "clinic_settings_update_receptionist"
  on clinic_settings for update to authenticated
  using (public.get_my_role() = 'receptionist');

create policy "clinic_settings_delete_receptionist"
  on clinic_settings for delete to authenticated
  using (public.get_my_role() = 'receptionist');
