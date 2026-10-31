# Deploying to Vercel with a hosted Supabase project

This is the operational runbook for putting the clinic app online. It is **not**
a Phase 10 build: `/specs/phase-10-deployment.md` does not exist yet, and no
phase status was advanced by writing this. The decisions a spec would normally
settle (email confirmation policy, SMS spend, hosting plan) are called out
explicitly below so you can make them knowingly.

The app currently runs only against the local Supabase stack. Everything below
is one-time setup: hosted Supabase → schema → staff accounts → auth settings →
GitHub → Vercel.

---

## 0. What you need first

- A [Supabase](https://supabase.com) account (free tier is enough to test, see §10)
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account
- Your Semaphore API key and an approved sender name (already used locally)

The repo is already a git repository on `main` with a clean working tree. It just
has no remote yet.

---

## 1. Create the hosted Supabase project

1. Supabase dashboard → **New project**.
2. Name it (e.g. `golden-friendship-clinic`), generate a strong database
   password, and **save that password** — `supabase db push` asks for it.
3. **Region:** Southeast Asia (Singapore) — closest to Cagayan de Oro.
4. **Postgres version:** 17. It must match `supabase/config.toml`
   (`major_version = 17`); a lower major version will reject the migrations.
5. Wait for provisioning to finish.

Free-tier projects pause after ~7 days without activity. A clinic that actually
uses this needs Pro.

## 2. Push the schema

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

There are 8 migration files in `supabase/migrations/`; they apply in filename
order and include the RLS policies and explicit table grants the app relies on.
`clinic_settings` is seeded by a migration with the placeholder
`receptionist_phone` — replace it in the app's Settings page after launch.

**`db push` does not run `supabase/seed.sql`.** The weekly clinic hours have to
be inserted once by hand (SQL editor), and only once — the script has no
`on conflict` guard, so running it twice doubles the rows:

```sql
select count(*) from doctor_availability;   -- expect 0 before seeding

insert into doctor_availability (day_of_week, start_time, end_time, slot_duration_minutes)
values
  (1, '09:00', '17:00', 30),
  (2, '09:00', '17:00', 30),
  (3, '09:00', '17:00', 30),
  (4, '09:00', '17:00', 30),
  (5, '09:00', '17:00', 30);
```

## 3. Create the staff accounts

`scripts/seed-staff.ts` deliberately refuses any non-local Supabase URL, so it
cannot (and should not) create production staff. Use the dashboard:

1. **Authentication → Users → Add user** for each staff member. Turn
   **Auto Confirm User** on. Set **User Metadata** so the profile trigger picks
   up their details:
   ```json
   { "full_name": "Dr. Real Name", "phone": "+639171234567" }
   ```
2. The `handle_new_user` trigger creates a `profiles` row with role `patient`.
   Promote it with the SQL editor:
   ```sql
   update public.profiles p
   set role = 'doctor'          -- or 'receptionist'
   from auth.users u
   where u.id = p.id and u.email = 'doctor@yourclinic.ph';
   ```
3. Verify:
   ```sql
   select u.email, p.role from public.profiles p
   join auth.users u on u.id = p.id order by p.role;
   ```

Do **not** reuse the local dev passwords (`dev-password-only`). Roles can only
be changed through the service-role path — the anti-escalation trigger blocks
every other route, same as locally.

## 4. Auth settings (this one will bite you if skipped)

In **Authentication → Sign In / Providers → Email**:

- **Turn "Confirm email" OFF.** Hosted projects default to ON, unlike
  `supabase/config.toml` (`enable_confirmations = false`). The app has no
  `/auth/confirm` route and `/signup` redirects straight to `/patient`, so with
  confirmations on, every signup fails with "We could not create the account."
  Turning it off matches local behavior. If you want confirmation emails
  instead, that is a small feature to build first (handler route + a "check your
  email" state) — tell me and I'll add it.
- Minimum password length: 6 is the project default; the signup form already
  requires 8.

In **Authentication → URL Configuration**:

- **Site URL:** `https://<your-app>.vercel.app`
- **Redirect URLs:** `https://<your-app>.vercel.app/**` and, for preview
  deployments, `https://*-<your-team-slug>.vercel.app/**`

## 5. Collect the credentials

Supabase → **Settings → API**:

| Value | Used as |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` |

The service-role key bypasses RLS. It is only read by server routes, so keep it
off any variable whose name starts with `NEXT_PUBLIC_`.

> If you use the newer `sb_publishable_…` / `sb_secret_…` keys instead of the
> legacy JWTs, they work in the same three variables.

## 6. Put the code on GitHub

Create an **empty** repository (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already excludes `.env*` (except `.env.local.example`), `.next`,
`supabase/.temp`, and `graft/`, so no local secrets or artifacts go up. Per
`AGENTS.md`, nothing is committed for you — commit the current working tree
yourself when you're ready.

## 7. Import into Vercel

1. Vercel → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Root directory `.`, no build
   command or output overrides. Node 22 is fine for Next 16.
3. Add these environment variables for **Production and Preview** *before* the
   first build — `NEXT_PUBLIC_*` values are inlined at build time, so changing
   them later requires a redeploy:

| Variable | Value / notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
| `SEMAPHORE_API_KEY` | production API key |
| `SEMAPHORE_SENDER_NAME` | approved sender name |
| `SEMAPHORE_DRY_RUN` | `true` until you have accepted SMS spend |
| `CRON_SECRET` | long random string, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

4. **Deploy.**

Optional: Project Settings → Functions → Function Region. Default is Washington
DC (`iad1`); Singapore (`sin1`) is much closer to both the clinic and the
database. Availability depends on plan.

## 8. The reminder cron

`vercel.json` schedules `/api/cron/send-reminders` once a day at `0 1 * * *`
UTC = **09:00 Philippine time**, which is 24h ±12h ahead of the next day's
appointments. Vercel sends `Authorization: Bearer $CRON_SECRET` on cron
invocations automatically when that variable exists, and the route already
requires exactly that header.

- Hobby plan: one run per day, may fire up to an hour late; max 2 cron jobs.
  Pro allows finer schedules.
- The route skips appointments that already have a `sent` reminder, so a late or
  duplicated run does not double-text or double-charge.
- To pause reminders entirely: remove the `crons` entry from `vercel.json`
  (deploying that change) or leave `SEMAPHORE_DRY_RUN=true`.

Reminder timing is computed in explicit Philippine wall-clock time
(`Asia/Manila`, fixed UTC+8), not server-local time, so it behaves the same on
Vercel's UTC runtime as it does locally.

## 9. Smoke test the deployed URL

1. `/` loads and the "Open today…" line matches the real day.
2. Sign up a throwaway patient → you land on `/patient` (if you get "could not
   create the account", email confirmation is still on — see §4).
3. Book a slot → it appears as PENDING in the receptionist console.
4. Confirm it with a fee → an SMS row is logged (dry-run success).
5. `/receptionist/reports` renders its charts and print view.
6. Sign out and back in → each role lands on its own home.
7. Check the cron route by hand:
   ```bash
   curl -i -H "Authorization: Bearer <CRON_SECRET>" \
     https://<your-app>.vercel.app/api/cron/send-reminders
   ```
   Expect `200` and `{"matched":…,"sent":…,"failed":…}`.

## 10. Before this runs a real clinic

- **Replace the stock doctor portrait** in `public/images/` (provenance in
  `CREDITS.md`). Every image there is a Pexels stand-in and the portrait is
  labelled as an illustration in the UI.
- Set the real `receptionist_phone` and clinic name in **Settings**.
- **SMS:** Semaphore sender names must be approved, and sending costs money per
  message. Decide the monthly budget before setting `SEMAPHORE_DRY_RUN=false`.
  Confirmation texts fire from the confirm dialog; reminders fire daily from the
  cron.
- **Plans:** Vercel's Hobby plan is for non-commercial use — a real clinic
  deployment should be Pro. Supabase free pauses after a week of inactivity and
  has no daily backups; Pro covers both.
- **Data:** patient names, phones, appointment reasons and payment references
  are personal data under the Philippine Data Privacy Act. Access is already
  RLS-scoped per role; don't add logging that dumps row contents.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Signup always fails after deploy | Email confirmation still on (§4) |
| "Invalid API key"/auth errors everywhere | `NEXT_PUBLIC_*` vars missing at build time, or site URL mismatch |
| `/receptionist` shows empty data | Staff `profiles.role` not promoted (§3) |
| Booking page shows no slots | `doctor_availability` was never seeded (§2) |
| Cron returns 500 "CRON_SECRET not configured" | Env var not set on Vercel |
| Cron returns 401 | Request wasn't from Vercel Cron and lacks the bearer token |
