-- Senior/PWD priority support (upgrade track, Feature 2)
-- One combined flag on the patient (a person is senior OR PWD, not an
-- appointment), a per-appointment discount column for reporting, and the
-- configurable discount percent. Priority is VISIBILITY ONLY: nothing here
-- touches slot conflicts — uq_appointments_slot stays the single scheduling
-- authority, and no queue ordering changes.

alter table patients
  add column is_senior_pwd boolean not null default false;

-- What the desk actually gave away per appointment: the peso gap between the
-- normal fee and what was charged. Null = no discount given (the common case —
-- every flag-off or full-fee appointment). Reported as "discounts granted" on
-- the Collections card and exported to CSV. Never computed back out of
-- payment_amount: the desk may waive or negotiate for reasons that are not
-- the senior/PWD discount, and the report must not invent discounts.
alter table appointments
  add column discount_amount numeric(10, 2);

alter table appointments
  add constraint appointments_discount_amount_check
  check (discount_amount is null or discount_amount >= 0);

-- Configurable discount percent (RA 9994 / RA 10754 mandate 20%; the clinic
-- can change it in Settings). It only PREFILLS the fee field for flagged
-- patients — the stored payment_amount is always the desk's own figure.
insert into clinic_settings (key, value)
values ('senior_discount_percent', '20')
on conflict (key) do nothing;

-- SECURITY (same shape as the fee migration): discount_amount is a staff
-- fact — a patient self-inserting a request must not be able to assert one.
-- Re-pin it alongside the payment fields on the patient self-insert policy.
drop policy if exists appointments_insert_own on appointments;
create policy "appointments_insert_own" on appointments
  for insert to authenticated with check (
    source = 'online'
    and status = 'PENDING'
    and payment_method is null
    and payment_reference is null
    and payment_amount is null
    and discount_amount is null
    and patient_id in (select id from patients where profile_id = auth.uid())
  );

-- No new tables and no new grants: the new columns ride the table-level
-- grants from phase 1 (grant all ... on all tables in schema public), and
-- clinic_settings already carries its grants. RLS is unchanged elsewhere:
-- the flag is readable via the existing patients select policies and
-- writable via patients_update_own (self-assertion, same trust level as the
-- name on the signup form — the desk verifies when money changes hands) and
-- patients_update_staff (receptionist toggles it from the desk surfaces).
