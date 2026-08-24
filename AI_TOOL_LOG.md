# AI Tool Log

Populated from changelog.md at phase closeout — not hand-written.

| Phase | Date | Tool(s) | Summary |
|---|---|---|---|
| 1 | 2026-08-23 | OpenCode (ox-alpha) — plan + build mode | Scaffolded Next.js 16 app, installed deps + shadcn/ui, wrote phase1 schema migration + seed, client helpers, placeholder page + health route. All 9 spec test cases pass. Deviations logged in changelog.md. |
| 2 | 2026-08-23 | OpenCode (ox-alpha) — plan + build mode | Phase2 auth/RLS migration (get_my_role, handle_new_user + anti-escalation triggers, all policies), middleware + getCurrentProfile, seed-staff + test harness scripts. All 13 spec test cases pass. Key deviation: local GoTrue writes app_metadata post-INSERT, so seed script sets staff roles explicitly. |
| 3 | 2026-08-24 | OpenCode (ox-alpha) — plan + build mode | Phase3 slot logic: uq_patients_profile_id + availability_exceptions migration, getAvailableSlots/createAppointment/findOrCreatePatient modules, auth-gated /api routes, 12-test harness — all pass. Deviations: route gating added, explicit grants needed for new table, harness mirrors lib functions (tsx can't resolve @/ alias). |
