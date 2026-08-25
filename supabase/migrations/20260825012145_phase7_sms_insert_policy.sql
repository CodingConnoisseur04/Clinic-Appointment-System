-- Phase 7 — Semaphore SMS: sms_logs INSERT policy
-- Per /specs/phase-7-semaphore-sms.md §2
-- Confirmation SMS runs on the receptionist's own session, so it needs an
-- authenticated INSERT path. The reminder route (system-triggered, no user
-- session) uses admin.ts — correct there by category, not a workaround.

create policy "sms_logs_insert_receptionist" on sms_logs
  for insert to authenticated with check (public.get_my_role() = 'receptionist');
