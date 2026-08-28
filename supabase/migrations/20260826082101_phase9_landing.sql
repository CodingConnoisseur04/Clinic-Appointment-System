-- Phase 9 — Landing Page, Branding & Logout
-- Per /specs/phase-9-landing-branding-logout.md §2.1
--
-- First `to anon` policy in this project — deliberate, not habit: operating
-- hours are non-sensitive (same reasoning as Phase 3's slot times), and the
-- public landing page exists to show accurate hours to visitors with no
-- session. Read-only; availability_write_doctor (Phase 2) is untouched.

create policy "availability_select_anon" on doctor_availability
  for select to anon using (true);
