-- Fee collections: log the peso amount of a manually-collected consultation
-- fee against an appointment. Money still never moves through this system —
-- this is the collections logbook, not a billing system.

alter table appointments
  add column payment_amount numeric(10, 2);

-- A peso amount cannot be negative; 0 is allowed (a waived/pro-bono visit is
-- a real thing and should still be loggable).
alter table appointments
  add constraint appointments_payment_amount_check
  check (payment_amount is null or payment_amount >= 0);

-- SECURITY FIX (found while adding the amount): the patient self-insert
-- policy only constrained source/status/patient_id — a patient could have
-- self-asserted payment_method/payment_reference, and now payment_amount
-- too. Payment fields are staff-only facts; pin them to null on patient
-- inserts. Patients have no UPDATE policy, so this closes the only path.
drop policy if exists appointments_insert_own on appointments;
create policy "appointments_insert_own" on appointments
  for insert to authenticated with check (
    source = 'online'
    and status = 'PENDING'
    and payment_method is null
    and payment_reference is null
    and payment_amount is null
    and patient_id in (select id from patients where profile_id = auth.uid())
  );

-- Default consultation fee (pesos, whole number) prefilled into every
-- payment dialog; editable per appointment and changeable in Settings.
insert into clinic_settings (key, value)
values ('consultation_fee', '500')
on conflict (key) do nothing;
