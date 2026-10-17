# Clinic Appointment System - Verified Facts

Audit date: 2026-10-17. Scope: the repository as it exists on disk today, on branch `main`.
Method: read-only inspection. No migrations, resets, seeds, tests, dev server, or SMS sends were run.
Names of the real clinic and the doctor, phone numbers, and real email addresses are redacted as `[redacted]` per the audit brief.

---

## 1. Overview

1. The system is a Next.js App Router web application for one small, single-doctor family clinic in the Philippines, with three roles - patient, receptionist, doctor - stored as a PostgreSQL enum and enforced by Row-Level Security [supabase/migrations/20260823173553_phase1_schema.sql:6; supabase/migrations/20260823180000_phase2_auth_rls.sql].
2. Patients self-register, submit appointment requests against currently open slots, and read their own history; the receptionist confirms or cancels requests, books walk-ins, moves appointments, marks attendance, logs fees, edits clinic settings and reads reports; the doctor reads a confirmed-only schedule and edits weekly hours and closed dates [src/app/patient/book/page.tsx; src/app/receptionist/pending/page.tsx; src/app/receptionist/appointments/page.tsx; src/app/doctor/schedule/page.tsx; src/app/doctor/availability/page.tsx].
3. Supabase (local CLI + Docker) supplies Postgres, Auth and PostgREST; a partial unique index on `appointments` is the authority that prevents double booking, and the app never hard-deletes appointments - cancellation is a status [supabase/migrations/20260823173553_phase1_schema.sql:68-70].
4. SMS is the only notification channel, sent through Semaphore v4; dry-run is the committed example default and no email channel exists [src/lib/sms/send-sms.ts; .env.local.example:10; PRODUCT.md].
5. There is no hosted environment: everything is built and tested against the local stack, and all existing data is local test data [PRODUCT.md; progress.md].

### Versions

Installed versions are read from `node_modules/<pkg>/package.json`; declared ranges are from `package.json`. `^`/exact declarations are shown as written there.

| Package | Declared in package.json | Installed | Evidence |
|---|---|---|---|
| Next.js | `16.3.2` (exact) | 16.3.2 | [package.json; node_modules/next/package.json] |
| React | `19.2.8` (exact) | 19.2.8 | [package.json; node_modules/react/package.json] |
| React DOM | `19.2.8` (exact) | 19.2.8 | [package.json; node_modules/react-dom/package.json] |
| `@supabase/supabase-js` | `^2.112.3` | 2.112.3 | [package.json; node_modules/@supabase/supabase-js/package.json] |
| `@supabase/ssr` | `^0.12.4` | 0.12.4 | [package.json; node_modules/@supabase/ssr/package.json] |
| PostgreSQL | configured `major_version = 17` | running server version UNVERIFIED | [supabase/config.toml:42] |
| Tailwind CSS | `^4` (devDependency), `@tailwindcss/postcss ^4` | 4.3.3 | [package.json; node_modules/tailwindcss/package.json] |
| zod | `^4.4.3` | 4.4.3 | [package.json; node_modules/zod/package.json] |
| TypeScript | `^5` | 5.9.3 | [package.json; node_modules/typescript/package.json] |
| date-fns | `^4.4.0` | 4.4.0 | [package.json] |
| recharts | `^3.8.0` | 3.8.0 | [package.json] |
| Playwright | `^1.62.1` | 1.62.1 | [package.json] |
| sonner | `^2.0.8` | 2.0.8 | [package.json] |
| lucide-react | `^1.33.0` | 1.33.0 | [package.json] |
| `@base-ui/react` | `^1.7.0` | 1.7.0 | [package.json] |
| react-day-picker | `^10.0.1` | 10.0.1 | [package.json] |
| tsx | `^4.23.12` | 4.23.12 | [package.json] |
| ESLint | `^9` | 9.39.5 | [package.json] |
| Supabase CLI | not a dependency | recorded latest `v2.121.0` in `supabase/.temp/cli-latest`; installed CLI version UNVERIFIED | [supabase/.temp/cli-latest] |

Framework details: Next 16 App Router; session refresh runs in `src/proxy.ts` (Next 16's proxy convention), calling `updateSession` [src/proxy.ts; src/lib/supabase/middleware.ts]. Canonical local app URL is `http://127.0.0.1:3000`, with `allowedDevOrigins: ["127.0.0.1"]` [next.config.ts].

---

## 2. Roles and routes

### Page routes

`requireRole` is called in each role layout. A signed-out user is redirected to `/login`; a signed-in user with the wrong role is redirected to that role's own home (`/patient`, `/doctor`, or `/receptionist`) [src/lib/auth/require-role.ts].

| Route | Reachable by | What they can do there | What they cannot do | Evidence |
|---|---|---|---|---|
| `/` | anyone (public) | See clinic name, services, live weekly hours, doctor card, location/contact, and buttons "Request an appointment" (to `/signup`), "I already have an account" and "Log in" (to `/login`) | Nothing is written from this page; no booking form | [src/app/page.tsx:183,206,215,466] |
| `/login` | anyone (public) | Sign in with email + password; on success routed to the role home | No password-reset link or MFA prompt | [src/app/login/page.tsx:32,105] |
| `/signup` | anyone (public) | Create a patient account (name, mobile, optional senior/PWD switch, email, password); on success routed to `/patient` | Cannot choose a role; cannot set payment fields | [src/app/signup/page.tsx:195] |
| `/patient` | patient | Server redirect to `/patient/book` | - | [src/app/patient/page.tsx] |
| `/patient/book` | patient | Pick a day and an open time, edit name/mobile, add an optional reason, "Send request"; after success see a receipt card | Cannot confirm, pay, reschedule or cancel; cannot pick an arbitrary time through the UI | [src/app/patient/book/page.tsx:208-338] |
| `/patient/appointments` | patient | Read own appointments split into "Upcoming" and "Past and cancelled", with status, reason, payment amount/method/reference, and fee-to-bring text; button "Request an appointment" | No edit, cancel, reschedule or confirm control exists on the page | [src/app/patient/appointments/page.tsx:143,151,183,194] |
| `/doctor` | doctor | Server redirect to `/doctor/schedule` | - | [src/app/doctor/page.tsx] |
| `/doctor/schedule` | doctor | Read CONFIRMED appointments for today or this week, with patient name, phone, reason, senior/PWD mark; toggle "Today" / "This week" | No write controls; cannot see PENDING or CANCELLED rows | [src/app/doctor/schedule/page.tsx; supabase/migrations/20260823180000_phase2_auth_rls.sql:105-110] |
| `/doctor/availability` | doctor | Edit weekly hours (start, end, Open switch, "Save"); close a date with "Close that day"; reopen with "Reopen" | Cannot edit appointments, patients, payments or reports | [src/app/doctor/availability/page.tsx:262,298,331] |
| `/receptionist` | receptionist | Today/tomorrow desk ledger, counts ("Requests to action", "Confirmed today", "Still to come", "Booked tomorrow"), link "Register a walk-in" and pending-count link | Read-only ledger; no status changes from this page | [src/app/receptionist/page.tsx:153,198,206] |
| `/receptionist/pending` | receptionist | Review PENDING online requests; "Confirm & log payment" (opens payment dialog); "Cancel request"; toggle the patient's senior/PWD flag | No reschedule from this page; does not send a cancel SMS | [src/app/receptionist/pending/page.tsx:234,242,255] |
| `/receptionist/walk-in` | receptionist | Look up a patient by mobile, create/reuse the patient record, pick day/time, optionally log payment, "Book & confirm now" | Cannot book into a closed date or an occupied slot | [src/app/receptionist/walk-in/page.tsx:483-485,567] |
| `/receptionist/appointments` | receptionist | Filter by status and one day; "Move", "Cancel", "Attended", "No-show"; toggle senior/PWD flag; read payment details | No delete; no bulk operations; no editing of patient demographics beyond the senior/PWD toggle | [src/app/receptionist/appointments/page.tsx:334,344,359] |
| `/receptionist/reports` | receptionist | Date-range reports, "Export CSV", print handout | No editing; no SMS-delivery report | [src/app/receptionist/reports/page.tsx] |
| `/receptionist/settings` | receptionist | Edit public phone, consultation fee, senior/PWD discount percent; "Save settings" | Cannot manage users, roles or hours | [src/app/receptionist/settings/page.tsx:97,141,160,181] |

### API routes

| Route | Method | Access control | Purpose | Evidence |
|---|---|---|---|---|
| `/api/available-slots` | GET | Any authenticated user (401 otherwise); any role | Returns open slots for one date, computed with the service-role client because a patient session cannot see other patients' bookings | [src/app/api/available-slots/route.ts] |
| `/api/patients/find-or-create` | POST | Any authenticated user; a non-receptionist may only pass their own `profileId` (403 otherwise) | Canonicalizes the phone and reuses an existing patient row or creates one, using the service-role client | [src/app/api/patients/find-or-create/route.ts] |
| `/api/sms/send-confirmation` | POST | Authenticated user whose `profiles.role` is `receptionist` (401 / 403 otherwise) | Sends and logs the confirmation SMS | [src/app/api/sms/send-confirmation/route.ts] |
| `/api/cron/send-reminders` | GET | `Authorization: Bearer <CRON_SECRET>`; 500 if the secret is unset, 401 on mismatch | Sends day-before reminders with the service-role client | [src/app/api/cron/send-reminders/route.ts] |
| `/api/health` | GET | No authentication check | Reads `doctor_availability` with the service-role client and returns it | [src/app/api/health/route.ts] |

### Wrong-role and signed-out behavior

- Opening any `/patient/*`, `/doctor/*` or `/receptionist/*` page while signed out redirects to `/login` [src/lib/auth/require-role.ts].
- Opening another role's page while signed in redirects to your own role home, not to an error page [src/lib/auth/require-role.ts].
- `/login` and `/signup` do not redirect an already-signed-in user; no session check runs on page load [src/app/login/page.tsx; src/app/signup/page.tsx].
- Underneath the UI, RLS still applies: a wrong-role write through the client matches zero rows or is rejected, and the helpers translate that into `NOT_FOUND_OR_DENIED` [src/lib/booking/update-appointment.ts; src/lib/booking/reschedule-appointment.ts].

### What each role cannot do, by database policy

- Patient: cannot update or delete any appointment; cannot read another patient's patient row or appointments; cannot set payment method, reference, amount or discount on insert [supabase/migrations/20260823180000_phase2_auth_rls.sql:88-116; supabase/migrations/20260918010000_senior_pwd_priority.sql:31-44].
- Receptionist: cannot write `doctor_availability` or `availability_exceptions`; cannot change any role; cannot delete patients or appointments [supabase/migrations/20260823180000_phase2_auth_rls.sql:70-80; supabase/migrations/20260824050822_phase3_slot_logic.sql:24-31].
- Doctor: cannot insert or update appointments; cannot write patient rows, settings or SMS logs; can read only CONFIRMED appointments [supabase/migrations/20260823180000_phase2_auth_rls.sql:96-116; supabase/migrations/20260829000000_clinic_settings.sql:17-30].
- Every role: cannot change `profiles.role` directly; the anti-escalation trigger raises `role cannot be changed directly` [supabase/migrations/20260823180000_phase2_auth_rls.sql:45-60].

---

## 3. Key user flows

### (a) Patient signs up and signs in

1. Open `/` and click **"Request an appointment"** (hero or closing band) -> `/signup`; or click **"Log in"** -> `/login` [src/app/page.tsx:183,206,466].
2. On `/signup`, fill **Full name**, **Mobile number**, optionally toggle **Senior citizen or PWD**, **Email**, **Password**, then click **"Create account"** [src/app/signup/page.tsx:195].
3. Result: Supabase Auth creates `auth.users`; the `on_auth_user_created` trigger inserts a `profiles` row with role `patient`; the browser is pushed to `/patient`, which redirects to `/patient/book` [src/app/signup/page.tsx:55-77; supabase/migrations/20260823180000_phase2_auth_rls.sql:15-40].
4. No email confirmation step occurs: `[auth.email] enable_confirmations = false`, and the page treats a signup without a session as an error [supabase/config.toml:226; src/app/signup/page.tsx:73-84].
5. Sign in path: open `/login`, fill **Email** and **Password**, click **"Sign in"**; on success the page reads `profiles.role` and pushes to `/patient`, `/doctor` or `/receptionist` [src/app/login/page.tsx:32-50,105]. Wrong credentials show "That email and password did not match. Check both and try again." [src/app/login/page.tsx:41-45].

### (b) Patient requests an appointment

1. On `/patient/book`, choose a day in the calendar under **"When would you like to come in?"**; times are fetched from `/api/available-slots` [src/app/patient/book/page.tsx:227; src/components/booking/slot-picker.tsx].
2. Click one of the time buttons (for example **"9:00 AM"**); only non-cancelled bookings and active weekday hours are offered, and today's already-passed times are filtered out client-side [src/components/booking/slot-picker.tsx; src/lib/booking/get-available-slots.ts].
3. Under **"Who is the appointment for?"**, confirm or edit **Full name** and **Mobile number**, and optionally fill **Reason for the visit (optional)** [src/app/patient/book/page.tsx:245,275].
4. Click **"Send request"** [src/app/patient/book/page.tsx:338].
5. Result: the page first POSTs `/api/patients/find-or-create` (creates or reuses the patient row by canonical PH mobile), then inserts an appointment with `source = online`, `status = PENDING` through the patient's own RLS-bound client [src/app/patient/book/page.tsx:117-148; src/lib/booking/create-appointment.ts].
6. On success the form is replaced by a receipt card titled **"We have your request"** with the requested date/time, three explanation steps, **"Request another time"** and **"My appointments"** [src/app/patient/book/page.tsx:148-200].
7. Nothing is confirmed and nothing is charged at this point; the copy says the front desk will contact the patient to arrange payment [src/app/patient/book/page.tsx:155-190].

### (c) Receptionist confirms a request

1. Open `/receptionist/pending` (sidebar **"Requests to action"**) [src/components/nav/sidebar-nav.tsx:45].
2. On the request card, click **"Confirm & log payment"** [src/app/receptionist/pending/page.tsx:234].
3. In the dialog **"Log payment and confirm"**, choose **Payment method** (`Cash` / `GCash`), review **Fee collected (₱)** (prefilled from Settings; discounted prefill if the patient is flagged), and optionally enter **Payment reference** [src/app/receptionist/pending/page.tsx:255-345].
4. Click **"Confirm"** [src/app/receptionist/pending/page.tsx:374].
5. Result: the row is updated only if it is still `PENDING`; status becomes `CONFIRMED` and `payment_method`, `payment_reference`, `payment_amount`, `discount_amount` are written [src/lib/booking/update-appointment.ts, `confirmAppointment`].
6. A toast reads "Request confirmed."; the card leaves the pending list [src/app/receptionist/pending/page.tsx:88-96].
7. The page then POSTs `/api/sms/send-confirmation`. A banner with `role="status"` reads either "Confirmation SMS delivered to {name}." or "Confirmed, but the confirmation SMS failed for {name}, the failure is logged. Call them instead." [src/app/receptionist/pending/page.tsx:104-137].

### (d) Receptionist logs a payment

There are three entry points; all write the same four columns.

1. **At confirmation:** the dialog in flow (c). Fee is prefilled from the `consultation_fee` setting; the reference field says "Optional, but this is the only record that payment was taken." [src/app/receptionist/pending/page.tsx:255-345].
2. **After the visit:** on `/receptionist/appointments`, click **"Attended"** on a confirmed, unmarked, past-or-today row; in **"Mark as attended?"** the payment method, **Fee collected (₱)** and **Payment reference** can be entered, then click **"Yes, mark it"** [src/app/receptionist/appointments/page.tsx:320-338,618].
3. **At walk-in booking:** on `/receptionist/walk-in`, choose **Payment** = `Cash - paid now` or `GCash - paid now` (rather than the default `Not paid yet - collect after the visit`), enter the fee and reference, then **"Book & confirm now"** [src/app/receptionist/walk-in/page.tsx:483-485,567].
4. The amount may be left blank: the schema allows `NULL` payment amounts, and the libs write `null` when no amount is supplied [src/lib/booking/create-appointment.ts; src/lib/booking/update-appointment.ts; supabase/migrations/20260918000000_fee_collections.sql:5-12].

### (e) Receptionist books a walk-in

1. Open `/receptionist/walk-in` (sidebar **"Register a walk-in"** or the desk-page button) [src/components/nav/sidebar-nav.tsx:46; src/app/receptionist/page.tsx:198].
2. In card **"1 The patient"**, type **Mobile number** and click **"Look up"**; an exact canonical-phone match loads the existing record and shows "Existing record found. It will be reused..." [src/app/receptionist/walk-in/page.tsx:292-430].
3. Confirm or enter **Full name**; optionally **Email (optional)**, **Date of birth (optional)**, **Address (optional)**; toggle **Senior citizen / PWD** [src/app/receptionist/walk-in/page.tsx].
4. In card **"2 When they are being seen"**, pick a day and an open time [src/app/receptionist/walk-in/page.tsx:436].
5. In card **"3 Payment and confirm"**, optionally fill **Reason for the visit (optional)** and choose **Payment**: default `Not paid yet - collect after the visit`, or `Cash - paid now`, or `GCash - paid now` [src/app/receptionist/walk-in/page.tsx:460,483-485].
6. Click **"Book & confirm now"** [src/app/receptionist/walk-in/page.tsx:567].
7. Result: patient row is created or reused, appointment is inserted with `source = walk_in`, `status = CONFIRMED`, `handled_by` = the signed-in receptionist's profile id; toast "Walk-in booked and confirmed." [src/app/receptionist/walk-in/page.tsx:210-250; src/lib/booking/create-appointment.ts].
8. If and only if the method was `GCash`, the page calls `/api/sms/send-confirmation` and reports success or failure; cash and unpaid walk-ins send no SMS [src/app/receptionist/walk-in/page.tsx:252-276].

### (f) Reschedule

1. Open `/receptionist/appointments`, optionally filter by **Status** and **One day only** [src/app/receptionist/appointments/page.tsx:170-200].
2. On a row that is not cancelled, has no attendance mark, and has not started, click **"Move"** [src/app/receptionist/appointments/page.tsx:359].
3. In the dialog **"Move to another time"**, pick a new day and an open time, then click **"Move appointment"** [src/app/receptionist/appointments/page.tsx:425,502].
4. Result: the same appointment row is updated in place (same id, same payment record); toast "Moved from {old} to {new}." [src/lib/booking/reschedule-appointment.ts].
5. If the appointment was `CONFIRMED`, the page re-sends the confirmation SMS and the toast says either "... Confirmation text sent." or "... but the text failed. Call the patient on ..." [src/app/receptionist/appointments/page.tsx:480-498].
6. Refusals are typed: `ALREADY_CANCELLED`, `PAST_APPOINTMENT`, `SAME_SLOT`, `CLOSED_DATE`, `SLOT_TAKEN`, `NOT_FOUND_OR_DENIED`, `VALIDATION_ERROR` [src/lib/booking/reschedule-appointment.ts].

### (g) Cancel

1. From `/receptionist/pending`, click **"Cancel request"** on a pending card, then **"Cancel it"** in the dialog **"Cancel this request?"** (or **"Keep it"**) [src/app/receptionist/pending/page.tsx:242,392,406].
2. From `/receptionist/appointments`, click **"Cancel"** on a non-cancelled, unmarked row, then **"Cancel it"** in the dialog **"Cancel this appointment?"** [src/app/receptionist/appointments/page.tsx:401,415].
3. Result: `status` becomes `CANCELLED`; the row and its payment fields are preserved; the partial unique index stops blocking the freed slot [src/lib/booking/update-appointment.ts, `rejectAppointment`; supabase/migrations/20260823173553_phase1_schema.sql:68-70].
4. No SMS is sent on cancellation; both dialogs state the patient is not texted automatically [src/app/receptionist/pending/page.tsx:386-390; src/app/receptionist/appointments/page.tsx:390-397].
5. Patients and doctors have no cancel control and no UPDATE policy [supabase/migrations/20260823180000_phase2_auth_rls.sql:112-116].

### (h) Mark attended or no-show

1. Open `/receptionist/appointments`. The **"Attended"** and **"No-show"** buttons render only when the row is `CONFIRMED`, has `attendance = null`, and `appointment_date <= today` [src/app/receptionist/appointments/page.tsx:320-350].
2. Click **"Attended"** -> dialog **"Mark as attended?"** with payment fields, then **"Yes, mark it"**; this writes `attendance = ATTENDED` and, when supplied, the payment fields, scoped to `status = CONFIRMED` [src/lib/booking/update-appointment.ts, `markAttendance`].
3. Click **"No-show"** -> dialog **"Mark as no-show?"**, then **"Yes, mark it"**; this writes `attendance = NO_SHOW` and deliberately drops any payment payload [src/lib/booking/update-appointment.ts, `markAttendance`].
4. The dialog copy warns "This counts against the clinic's no-show rate in Reports." for a no-show [src/app/receptionist/appointments/page.tsx:545-560].
5. There is no un-mark or edit-attendance control in the UI; a marked row hides the buttons [src/app/receptionist/appointments/page.tsx:320].

### (i) Doctor edits weekly hours and closed dates

1. Open `/doctor/availability` (sidebar **"Working hours"**) [src/components/nav/sidebar-nav.tsx:66].
2. In **"Weekly working hours"**, edit the start/end time inputs and the **Open/Closed** switch for a weekday, then click **"Save"** on that row [src/app/doctor/availability/page.tsx:187-262].
3. Result: `doctor_availability` is updated; toast "Working hours saved." or a warning "Saved. N confirmed appointment(s) now fall outside these hours." The save is not blocked by conflicts [src/app/doctor/availability/page.tsx:120-138; src/lib/availability/update-hours.ts].
4. In **"Days the clinic is closed"**, choose **Date to close**, optionally a **Reason (optional)**, then click **"Close that day"**; the date appears under **"Upcoming closures"** [src/app/doctor/availability/page.tsx:275-330].
5. Click **"Reopen"** on a closure to delete that row [src/app/doctor/availability/page.tsx:331; src/lib/availability/manage-exceptions.ts].
6. `exception_date` is unique, so a duplicate close returns "ALREADY_CLOSED"; there is no bulk close and no partial-day closure [supabase/migrations/20260824050822_phase3_slot_logic.sql:11-16; src/lib/availability/manage-exceptions.ts].

### (j) Two people take the same slot (SLOT_TAKEN)

1. Trigger: two sessions load `/api/available-slots` for the same date while the slot is still free, both choose the same `date + time`, and both insert. Slot lists are computed before either insert, so both see the slot as open [src/app/api/available-slots/route.ts; src/lib/booking/get-available-slots.ts].
2. The database decides: `uq_appointments_slot` is a partial unique index on `(appointment_date, appointment_time) where status <> 'CANCELLED'`. The second insert raises unique violation `23505` [supabase/migrations/20260823173553_phase1_schema.sql:68-70].
3. Patient sees the toast **"That time was taken while you were typing, please pick another."** on `/patient/book`; the form is reset, the slot list is refreshed, and no receipt is shown [src/app/patient/book/page.tsx:137-142].
4. The patient row created moments earlier by `/api/patients/find-or-create` is not rolled back; only the appointment insert fails [src/app/patient/book/page.tsx:117-148].
5. Receptionist moving an appointment sees **"That time was taken while you were choosing, please pick another."** and the **"Move to another time"** dialog stays open so another slot can be picked [src/app/receptionist/appointments/page.tsx:464-475].
6. Receptionist booking a walk-in sees a toast built from the reason and message, i.e. **"SLOT_TAKEN: That slot is no longer available"**; the form is kept [src/app/receptionist/walk-in/page.tsx:278-283; src/lib/booking/create-appointment.ts].
7. There is no queue, lock, retry, or auto-reassignment: the loser must choose another time. Confirmation of a PENDING request does not change the slot, so it cannot itself cause SLOT_TAKEN [src/lib/booking/update-appointment.ts].

---

## 4. SMS

### Provider and configuration

- Provider: Semaphore v4, endpoint `https://semaphore.co/api/v4/messages`, form-encoded POST with `apikey`, `number`, `message`, and optional `sendername` [src/lib/sms/send-sms.ts, `sendSms`].
- Environment variable NAMES read by the code: `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `SEMAPHORE_DRY_RUN` [src/lib/sms/send-sms.ts; .env.local.example].
- The response parser accepts both the v4 array shape `[{ message_id, ... }]` and a legacy object shape; it treats HTTP 200 in-band errors as failures [src/lib/sms/send-sms.ts; scripts/probe-sms-response-shapes.ts].

### Which events send a message

| Event | Where triggered | Message type | Evidence |
|---|---|---|---|
| Receptionist confirms a PENDING online request | `/receptionist/pending`, after a successful confirm | `confirmation` | [src/app/receptionist/pending/page.tsx:347-380] |
| Receptionist moves an already-CONFIRMED appointment | `/receptionist/appointments`, after a successful move | `confirmation` (re-send of the new time) | [src/app/receptionist/appointments/page.tsx:480-498] |
| Walk-in paid now by GCash | `/receptionist/walk-in`, after a successful insert | `confirmation` | [src/app/receptionist/walk-in/page.tsx:252-276] |
| Day-before reminder | `GET /api/cron/send-reminders` | `reminder` | [src/app/api/cron/send-reminders/route.ts] |

No SMS is sent on: online request submission, cancellation, no-show marking, cash walk-in, unpaid walk-in, or doctor actions [src/app/patient/book/page.tsx; src/app/receptionist/pending/page.tsx:386-390; src/lib/booking/update-appointment.ts].

### Dry-run switch

- Variable: `SEMAPHORE_DRY_RUN`. The code treats the send as dry-run only when the value is exactly the string `"true"` [src/lib/sms/send-sms.ts, `sendSms`].
- Committed example default: `SEMAPHORE_DRY_RUN=true` [.env.local.example:10]. `PRODUCT.md` also states it is the committed default; `progress.md` states it is currently set locally.
- If the variable is unset, the code does **not** default to dry-run: it proceeds to the live HTTP path and fails only if `SEMAPHORE_API_KEY` is missing [src/lib/sms/send-sms.ts].
- Dry-run effect: the HTTP call is skipped, a console line `[sms:dry-run] would send to <number>: <message>` is printed, and the function returns success with `messageId = "dry-run-<timestamp>"` [src/lib/sms/send-sms.ts].

### What a dry-run attempt writes to the SMS log

Both senders write one `sms_logs` row regardless of outcome:

| Column | Dry-run confirmation | Dry-run reminder |
|---|---|---|
| `appointment_id` | the appointment | the appointment |
| `type` | `confirmation` | `reminder` |
| `status` | `sent` | `sent` |
| `provider_response` | `dry-run success` | `dry-run success` |
| `sent_at` | default `now()` | default `now()` |

Evidence: [src/lib/sms/send-confirmation.ts, `sendConfirmationSms`; src/app/api/cron/send-reminders/route.ts]. The table's status enum has only `sent` and `failed`, so a dry run is indistinguishable from a real accepted send except by the `provider_response` string [supabase/migrations/20260823173553_phase1_schema.sql:9].

### Where a receptionist can see the SMS log row

- **There is no page that reads or displays `sms_logs` rows.** A repository-wide search finds `sms_logs` only in `src/lib/sms/send-confirmation.ts`, `src/lib/reports/get-sms-report.ts`, and the two API route files; no page or component queries it [grep over `src`].
- The closest UI surface is the `role="status"` banner on `/receptionist/pending` after a confirm, which reports the route's `delivered` flag, not the stored row: "Confirmation SMS delivered to {name}." or "Confirmed, but the confirmation SMS failed for {name}, the failure is logged. Call them instead." [src/app/receptionist/pending/page.tsx:104-137].
- After a reschedule of a CONFIRMED appointment, delivery is reported only in a transient toast [src/app/receptionist/appointments/page.tsx:486-496].
- No SMS-history view exists for the doctor or patient either.

### Does the reports page show SMS delivery?

**No.** `/receptionist/reports` renders four cards - "How much was collected?", "When do we get busy?", "Volume and mix", "Did they turn up?" - and never imports `getSmsReport` [src/app/receptionist/reports/page.tsx; src/lib/reports/get-sms-report.ts]. The changelog records the SMS-delivery card as removed at human request, with `getSmsReport` kept but unused [changelog.md:95-97]. One stale string remains: the page lead still says "... and whether the texts actually went out." [src/app/receptionist/reports/page.tsx:125].

### Day-before reminder

- Route: `GET /api/cron/send-reminders` [src/app/api/cron/send-reminders/route.ts].
- Protection: requires `Authorization: Bearer <CRON_SECRET>`. If `CRON_SECRET` is unset the route returns 500; a wrong or missing header returns 401 [src/app/api/cron/send-reminders/route.ts].
- Window: appointments whose start falls within plus or minus 12 hours of now + 24 hours [src/app/api/cron/send-reminders/route.ts, `reminderWindow`].
- Selection: `status = CONFIRMED` only; an appointment that already has a `reminder` row with `status = sent` is skipped (dedupe); failed reminders are retried [src/app/api/cron/send-reminders/route.ts].
- Message text: `Clinic reminder: you have an appointment on <YYYY-MM-DD> at <h:mm AM/PM>.` [src/app/api/cron/send-reminders/route.ts].
- No scheduler is configured in this repository. The spec deliberately deferred scheduling to a later phase, and no `vercel.json`, `netlify.toml`, `pg_cron`, or `cron.schedule` exists [specs/phase-7-semaphore-sms.md:25,128; grep over the repo].

---

## 5. Data model

**Exact counts: 7 application tables and 8 migration files.** Verified by listing `supabase/migrations/` (8 files) and by counting `create table` statements in them (7). Supabase-managed schemas (`auth`, `storage`, etc.) are not counted [supabase/migrations; supabase/config.toml].

### Enums (7)

| Enum | Values | Evidence |
|---|---|---|
| `user_role` | `patient`, `doctor`, `receptionist` | [supabase/migrations/20260823173553_phase1_schema.sql:6] |
| `appointment_status` | `PENDING`, `CONFIRMED`, `CANCELLED` | [same:7] |
| `attendance_status` | `ATTENDED`, `NO_SHOW` | [same:8] |
| `appointment_source` | `online`, `walk_in` | [same:9] |
| `payment_method` | `cash`, `gcash` | [same:10] |
| `sms_type` | `confirmation`, `reminder` | [same:11] |
| `sms_status` | `sent`, `failed` | [same:12] |

### Tables and columns

| Table | Columns | Key constraints |
|---|---|---|
| `profiles` | `id uuid PK`, `role user_role not null`, `full_name text not null`, `phone text`, `created_at timestamptz not null default now()` | `id` references `auth.users(id)` on delete cascade; no INSERT policy; role changes blocked by trigger | 
| `patients` | `id uuid PK default gen_random_uuid()`, `profile_id uuid`, `full_name text not null`, `phone text not null`, `email text`, `date_of_birth date`, `address text`, `created_at timestamptz not null default now()`, `is_senior_pwd boolean not null default false` | `profile_id` references `profiles(id)` on delete set null; partial unique `profile_id`; no DELETE policy |
| `doctor_availability` | `id uuid PK`, `day_of_week smallint not null check 0..6`, `start_time time not null`, `end_time time not null`, `slot_duration_minutes int not null default 30`, `is_active boolean not null default true` | `check (start_time < end_time)`; no uniqueness on `day_of_week` (multiple rows per weekday are possible) |
| `appointments` | `id uuid PK`, `patient_id uuid not null`, `appointment_date date not null`, `appointment_time time not null`, `reason text`, `source appointment_source not null`, `status appointment_status not null default 'PENDING'`, `attendance attendance_status`, `payment_reference text`, `payment_method payment_method`, `handled_by uuid`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `payment_amount numeric(10,2)`, `discount_amount numeric(10,2)` | `patient_id` references `patients(id)` on delete restrict; `handled_by` references `profiles(id)`; payment and discount checks `>= 0 or null` |
| `sms_logs` | `id uuid PK`, `appointment_id uuid not null`, `type sms_type not null`, `status sms_status not null`, `provider_response text`, `sent_at timestamptz not null default now()` | `appointment_id` references `appointments(id)` on delete cascade |
| `availability_exceptions` | `id uuid PK`, `exception_date date not null unique`, `reason text`, `created_at timestamptz not null default now()` | unique `exception_date` |
| `clinic_settings` | `key text PK`, `value text not null` | key-value store; seeded with `receptionist_phone`, `consultation_fee`, `senior_discount_percent` |

Evidence: [supabase/migrations/20260823173553_phase1_schema.sql:16-95; supabase/migrations/20260824050822_phase3_slot_logic.sql:11-16; supabase/migrations/20260829000000_clinic_settings.sql:3-13; supabase/migrations/20260918000000_fee_collections.sql:5-12; supabase/migrations/20260918010000_senior_pwd_priority.sql:6-22].

### Indexes

| Index | Definition | Purpose | Evidence |
|---|---|---|---|
| `idx_patients_phone` | `patients(phone)` | phone lookup / reconciliation | [db:35] |
| `uq_patients_profile_id` | **unique**, `patients(profile_id) where profile_id is not null` | stops one login owning two patient rows; walk-ins (`profile_id = null`) may repeat | [db:6-8] |
| `idx_appointments_date` | `appointments(appointment_date)` | date filters | [db:63] |
| `idx_appointments_patient` | `appointments(patient_id)` | patient history | [db:64] |
| `uq_appointments_slot` | **unique**, `appointments(appointment_date, appointment_time) where status <> 'CANCELLED'` | double-booking prevention; cancelled rows free the slot | [db:68-70] |
| `idx_sms_logs_appointment` | `sms_logs(appointment_id)` | per-appointment log reads | [db:93] |
| implicit unique index | `availability_exceptions(exception_date)` via `unique` | one closure per date | [db:11-16] |
| implicit unique indexes | every primary key | row identity | [all migrations] |

(db = `supabase/migrations/20260823173553_phase1_schema.sql`; the `uq_patients_profile_id` entry is `supabase/migrations/20260824050822_phase3_slot_logic.sql`.)

**How double booking is blocked:** both the online request insert and the walk-in insert write into the same `appointments` table. The partial unique index covers every row whose status is not `CANCELLED`, so a second `PENDING` or `CONFIRMED` row at the same date and time is rejected by PostgreSQL, not by the UI. The client helpers translate the resulting `23505` into a typed `SLOT_TAKEN` result [supabase/migrations/20260823173553_phase1_schema.sql:68-70; src/lib/booking/create-appointment.ts; src/lib/booking/reschedule-appointment.ts].

**How one login owning two patient rows is blocked:** `uq_patients_profile_id` is partial so walk-in rows with `profile_id = null` are exempt, but any non-null `profile_id` can appear only once. `findOrCreatePatient` links a walk-in row to the profile; if the link collides with an existing link, it returns the already-linked row instead of creating a duplicate [supabase/migrations/20260824050822_phase3_slot_logic.sql:6-8; src/lib/patients/find-or-create-patient.ts].

### Triggers and functions

| Object | Behavior | Evidence |
|---|---|---|
| `set_updated_at()` + `trg_appointments_updated_at` | sets `appointments.updated_at = now()` before update | [phase1:73-81] |
| `get_my_role()` | `security definer`, `stable`, reads `profiles.role` for `auth.uid()` to avoid RLS recursion | [phase2:7-14] |
| `handle_new_user()` + `on_auth_user_created` | after insert on `auth.users`, inserts a `profiles` row with role from `raw_app_meta_data->>'role'`, default `patient` | [phase2:15-40] |
| `prevent_role_change()` + `trg_prevent_role_change` | blocks any `profiles.role` change unless `auth.role() = 'service_role'` | [phase2:45-60] |

---

## 6. Security controls actually implemented

### Authentication

- Supabase Auth email + password. Sign-in uses `signInWithPassword`; signup uses `signUp` and never passes `app_metadata` [src/app/login/page.tsx:32; src/app/signup/page.tsx:55-70].
- Sessions are cookie-based through `@supabase/ssr`; the browser client, server client and admin client are separate modules [src/lib/supabase/client.ts; src/lib/supabase/server.ts; src/lib/supabase/admin.ts].
- Session refresh runs on every matched request via `src/proxy.ts`; it calls `getUser()` and returns the response with refreshed cookies [src/proxy.ts; src/lib/supabase/middleware.ts].
- Route handlers accept either the session cookie or an `Authorization: Bearer <access_token>` header (`getRequestUser`), the latter used by harnesses [src/lib/auth/get-request-user.ts].
- OAuth, magic links, passkeys and anonymous sign-in are not used: the only credential sign-in/sign-up calls in `src` are `signInWithPassword` and `signUp`; the external Apple provider is disabled, `enable_anonymous_sign_ins = false`, and the passkey section is commented out [src/app/login/page.tsx:32; src/app/signup/page.tsx:55; supabase/config.toml:176-188,322-340].

### How role is assigned and stored

- Role is stored in `profiles.role`, a `user_role` enum column, not in an editable user-metadata field [supabase/migrations/20260823173553_phase1_schema.sql:16-22].
- On signup, `handle_new_user()` reads `new.raw_app_meta_data->>'role'` and falls back to `patient`; the public signup form sends only `user_metadata` (name, phone, senior flag) and therefore always produces `patient` [supabase/migrations/20260823180000_phase2_auth_rls.sql:15-40; src/app/signup/page.tsx:55-70].
- Staff roles are assigned by the seed script using the service-role admin API. Because local GoTrue writes `app_metadata` after the user row, the script also explicitly updates `profiles.role` via the service-role client [scripts/seed-staff.ts, `ensureRole`].

### Role-escalation trigger

- `trg_prevent_role_change` fires `BEFORE UPDATE` on `profiles`. If `new.role` differs from `old.role` and `auth.role() <> 'service_role'`, it raises `role cannot be changed directly` [supabase/migrations/20260823180000_phase2_auth_rls.sql:45-60].
- There is intentionally no INSERT policy on `profiles`; only the `security definer` trigger can create profile rows [supabase/migrations/20260823180000_phase2_auth_rls.sql:42-43].

### RLS policy summary per table and role

All tables have RLS enabled. Policies are `to authenticated` unless noted. "None" means no policy exists, so the operation is denied by default.

| Table | anon | patient | doctor | receptionist |
|---|---|---|---|---|
| `profiles` | none | select own; update own row (role change still blocked) | select all | select all |
| `patients` | none | select where `profile_id = auth.uid()`; insert own; update own | select all | select all; insert; update (no delete) |
| `doctor_availability` | **select all** (landing hours) | select all | select all; insert/update/delete | select all |
| `availability_exceptions` | none | select all | select all; insert/update/delete | select all |
| `appointments` | none | select own via `patients.profile_id`; insert own only with `source=online`, `status=PENDING`, no payment fields; no update; no delete | select only `status=CONFIRMED` | select all; insert; update (no delete) |
| `sms_logs` | none | none | none | select; insert |
| `clinic_settings` | **select all** | select all | select all | select all; insert; update; delete |

Evidence: [supabase/migrations/20260823180000_phase2_auth_rls.sql:62-127; supabase/migrations/20260824050822_phase3_slot_logic.sql:18-31; supabase/migrations/20260825012145_phase7_sms_insert_policy.sql:8-9; supabase/migrations/20260826082101_phase9_landing.sql:10-12; supabase/migrations/20260829000000_clinic_settings.sql:15-31].

Policy count in force: 3 profiles + 6 patients + 3 doctor_availability + 2 availability_exceptions + 6 appointments + 2 sms_logs + 5 clinic_settings = **27 policies**. The appointment count treats the re-created `appointments_insert_own` as one policy: it is defined in Phase 2, dropped and re-created in the fee migration, then dropped and re-created again in the senior/PWD migration [supabase/migrations/20260918000000_fee_collections.sql:14-27; supabase/migrations/20260918010000_senior_pwd_priority.sql:29-44].

### Payment-field restriction on patient inserts

- The current `appointments_insert_own` policy requires `source = 'online'`, `status = 'PENDING'`, `patient_id` owned by the caller, **and** `payment_method is null`, `payment_reference is null`, `payment_amount is null`, `discount_amount is null` [supabase/migrations/20260918010000_senior_pwd_priority.sql:33-43].
- Patients have no UPDATE policy on appointments, so there is no second path to set these fields [supabase/migrations/20260823180000_phase2_auth_rls.sql:112-116].
- The fee and senior migrations both record this as a security fix for a previously exploitable self-assertion [supabase/migrations/20260918000000_fee_collections.sql:14-17; supabase/migrations/20260918010000_senior_pwd_priority.sql:29-32].

### Server-only admin client

- `createAdminClient()` imports `server-only`, uses `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and disables session persistence. Its comment forbids importing it from client components or `page.tsx` files [src/lib/supabase/admin.ts].
- It is imported by exactly four route handlers: `/api/available-slots`, `/api/patients/find-or-create`, `/api/cron/send-reminders`, `/api/health` [grep for `createAdminClient` under `src`].
- `/api/health` is the one unauthenticated handler that uses it; the response exposes `doctor_availability` rows [src/app/api/health/route.ts].

### Email confirmation and MFA

- **Email confirmation is off.** `[auth.email] enable_confirmations = false`; the signup code requires `data.session` and fails otherwise, so it only works with confirmations disabled [supabase/config.toml:226; src/app/signup/page.tsx:73-84].
- **MFA does not exist.** `[auth.mfa.totp] enroll_enabled = false` and `verify_enabled = false`; `[auth.mfa.phone]` is likewise disabled; WebAuthn is commented out. A search of `src` for `mfa`, `totp`, `2fa` and `authenticator` returns no application code [supabase/config.toml:297-318].

### Other implemented controls

- `profiles.role` is not writable by any client role; staff seeding requires the service-role key [supabase/migrations/20260823180000_phase2_auth_rls.sql:45-60; scripts/seed-staff.ts].
- `.env*` files are gitignored except `.env.local.example`, so the service-role key is not committed by default [.gitignore:33-35].
- The SMS confirmation route performs its own role check before the paid provider call, because RLS would otherwise only reject the log write after the send [src/app/api/sms/send-confirmation/route.ts].
- `find-or-create` refuses a `profileId` that is not the caller's own unless the caller is a receptionist [src/app/api/patients/find-or-create/route.ts].
- Both the seed script and every database-touching harness refuse a non-local Supabase URL (the offline SMS-parser probe has no URL guard because it makes no network or database calls) [scripts/seed-staff.ts; scripts/test-support.ts, `testAdmin`; scripts/probe-sms-response-shapes.ts].

---

## 7. Reports

All reports are on `/receptionist/reports` and share one input: a date range chosen in the **"Which days?"** calendar (`react-day-picker` range mode). The default range is today minus 29 days through today. The range is converted to `YYYY-MM-DD` strings and passed to four query functions [src/app/receptionist/reports/page.tsx:59-100,153].

| Report card | Function | Input | What it computes | Evidence |
|---|---|---|---|---|
| **How much was collected?** | `getCollectionSummary` | range, applied to `appointment_date` | Rows with non-null `payment_amount`; totals for cash, GCash, all collections, paid count, average fee, attended total/count, prepaid no-show total, sum of `discount_amount`, and per-day totals with no gap-filling | [src/lib/reports/get-collection-summary.ts] |
| **When do we get busy?** | `getPeakHours` | range, applied to `appointment_date` | All non-cancelled appointments bucketed by `appointment_time` (`HH:MM`); busiest slot and count | [src/lib/reports/get-peak-hours.ts] |
| **Volume and mix** | `getAppointmentSummary` | range, applied to `created_at` (UTC day boundaries) | Counts by current status (`PENDING` / `CONFIRMED` / `CANCELLED`) and by source (`online` / `walk_in`) | [src/lib/reports/get-appointment-summary.ts] |
| **Did they turn up?** | `getNoShowReport` | range, applied to `appointment_date`, plus `appointment_date <= today` | `attended`, `noShowMarked`, `noShowInferred`, `totalPastConfirmed`, `noShowRatePercent` | [src/lib/reports/get-no-show-report.ts] |
| **Export CSV** button | `downloadAppointmentCsv` | range, applied to `appointment_date` | One row per appointment with date, time, patient, phone, senior/PWD, source, status, reason, attendance, payment method, fee, discount, reference; UTF-8 BOM; browser download named `appointments_<from>_to_<to>.csv` | [src/lib/reports/download-csv.ts; src/app/receptionist/reports/page.tsx:145] |

### No-show rate: marked versus inferred

- The query selects `status = CONFIRMED` rows dated inside the range and on or before today [src/lib/reports/get-no-show-report.ts].
- Each row is counted once: `attendance = ATTENDED` -> attended; `attendance = NO_SHOW` -> marked no-show; `attendance IS NULL` -> inferred no-show ("Never marked" in the UI) [src/lib/reports/get-no-show-report.ts; src/app/receptionist/reports/page.tsx:405-420].
- Formula: `round((noShowMarked + noShowInferred) / totalPastConfirmed * 100)`; zero when there are no rows [src/lib/reports/get-no-show-report.ts].
- The inferred count is computed only in this read function and is never written back to `attendance` [src/lib/reports/get-no-show-report.ts, header comment].
- Because the filter is date-based and not time-based, a CONFIRMED appointment later today is included and currently counts as an inferred no-show until it is marked [src/lib/reports/get-no-show-report.ts].
- The collections report does not filter by status, so a cancelled appointment that already carries a `payment_amount` still contributes to "collected"; only `attendance = NO_SHOW` rows enter `prepaidNoShowTotal`, and an unmarked past row with a payment enters neither the attended nor the no-show subtotal [src/lib/reports/get-collection-summary.ts].

### Print handout

- There is no print button and no `window.print()` call. The handout is the browser's print function applied to `/receptionist/reports`.
- `@media print` in `globals.css` hides the sidebar, sticky asides, `[role="status"]`, all `button` elements and `.print\:hidden`; pins `print-color-adjust: exact`; keeps card borders and avoids breaking inside cards; constrains `.print-chart svg` to 100% width [src/app/globals.css:394-435].
- Chart containers marked `.print-chart` are the per-day collections chart and the peak-hours card [src/app/receptionist/reports/page.tsx:194,282].

---

## 8. How to run it locally

There is **no README, no Makefile and no shell script** in the repository (`ls README* Makefile *.sh` returned none). Commands come from `package.json` scripts and from the run orders recorded in `changelog.md` / `PRODUCT.md`.

| Step | Command | Where it is defined / documented |
|---|---|---|
| 1 | `npm install` | implied by `package.json`; not documented in a README (none exists) |
| 2 | `npx supabase start` | [PRODUCT.md:29]; also [changelog.md:337] |
| 3 | `npx supabase db reset` | applies all 8 migrations and then `supabase/seed.sql` because `[db.seed] enabled = true` and `sql_paths = ["./seed.sql"]` [supabase/config.toml:57-62]; run order in [changelog.md:434,538,622,702,777,880,944] |
| 4 | `npx tsx scripts/seed-staff.ts` | required after any reset because a reset wipes auth users [PRODUCT.md:33; progress.md:24-25] |
| 5 | `npm run dev` | `package.json` scripts: `"dev": "next dev"` |

Environment: create `.env.local` with the seven names in `.env.local.example`. The seed script reads `.env.local` itself and exits if `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing [scripts/seed-staff.ts:7-39]. Variable names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEMAPHORE_API_KEY`, `SEMAPHORE_SENDER_NAME`, `SEMAPHORE_DRY_RUN`, `CRON_SECRET` [.env.local.example].

### Default local URLs and ports

| Service | URL / port | Evidence |
|---|---|---|
| Next.js app (canonical) | `http://127.0.0.1:3000` (also `http://localhost:3000`) | [next.config.ts; supabase/config.toml:159] |
| Supabase API (PostgREST/Auth) | `http://127.0.0.1:54321` | [supabase/config.toml:7-10] |
| Postgres | `127.0.0.1:54322` | [supabase/config.toml:33-35] |
| Supabase Studio | `http://127.0.0.1:54323` | [supabase/config.toml:94-97] |
| Local email inbox (SMTP test UI) | `http://127.0.0.1:54324` | [supabase/config.toml:105-108] |
| Analytics | port `54327` | [supabase/config.toml:388-390] |
| Pooler | disabled; port `54329` if enabled | [supabase/config.toml:44-47] |

### Seeded test accounts (emails and roles, no passwords)

| Email | Role | Full name in seed | Password |
|---|---|---|---|
| `doctor@clinic.local` | `doctor` | `Dr. Test` | password set in `scripts/seed-staff.ts` |
| `receptionist@clinic.local` | `receptionist` | `Front Desk Test` | password set in `scripts/seed-staff.ts` |

Evidence: [scripts/seed-staff.ts, `staff` array]. The seed script is idempotent: if the user already exists it only re-asserts the role [scripts/seed-staff.ts, `seed`]. The design-review script also signs in with these two accounts plus a disposable review patient, using the same staff credential source [scripts/screenshot-review.mjs].

Harness-created accounts use the `@test.local` domain (for example `e2e-patient@test.local`) and are swept by `resetTestState()` [scripts/test-support.ts; scripts/test-smoke-e2e.ts]. Their passwords are hard-coded in the harnesses and are not reproduced here.

---

## 9. Test inventory

### Counting method

For each harness: `grep -cE "\breport\(" scripts/test-<name>.ts`, then subtract 1 for the `function report(...)` definition line, then collapse the duplicated if/else call sites that report the same check (test-phase2 check 4 and check 13, test-phase7 check 5, test-reschedule-browser "Move button visible on today's upcoming row"). Arithmetic: 116 call sites after removing definitions, minus 4 duplicate branches = **112 distinct checks**.

### Harnesses

| Script | Covers | Call sites incl. definition | Distinct checks | How it is run | Automatic? |
|---|---|---|---|---|---|
| `scripts/test-phase2.ts` | Public signup defaults to patient; no self-elevation; seeded staff roles; patient row isolation; own insert allowed; out-of-constraint insert rejected; no patient update; receptionist full write; doctor CONFIRMED-only and no write; availability write by doctor only; `sms_logs` receptionist-only; role-escalation block; middleware survives signed-out visit | 16 | **13** | `npx supabase db reset` -> `npx tsx scripts/seed-staff.ts` -> `npx tsx scripts/test-phase2.ts`; dev server optional for check 13 [changelog.md:434-436] | Manual |
| `scripts/test-phase3.ts` | `uq_patients_profile_id`; exceptions RLS; normal weekday slots; closed date returns none; booked excluded and cancelled re-included; online + walk-in create; `CLOSED_DATE`; live `/api/available-slots` route; concurrent inserts produce one win + typed `SLOT_TAKEN`; phone reuse; create when no match; signup -> register -> book | 13 | **12** | reset -> seed -> `npm run dev` -> `npx tsx scripts/test-phase3.ts` [changelog.md:538-539] | Manual |
| `scripts/test-phase4.ts` | Confirm writes payment fields; reject sets `CANCELLED`; attendance writes `ATTENDED`/`NO_SHOW`; one-call walk-in `CONFIRMED` + payment; patient session denied on all three updates | 6 | **5** | reset -> seed -> `npx tsx scripts/test-phase4.ts` [changelog.md:622-623] | Manual |
| `scripts/test-phase5.ts` | Fresh signup creates patient row; online create defaults `PENDING`; returning patient reuses row; patient sees only own appointments; concurrent same-slot requests -> `SLOT_TAKEN` | 6 | **5** | reset -> seed -> `npm run dev` -> `npx tsx scripts/test-phase5.ts` [changelog.md:702-703] | Manual |
| `scripts/test-phase6.ts` | `getSchedule` CONFIRMED-only and joins patient; scope for receptionist vs patient; hours update allowed for doctor, denied for others; exceptions add/remove allowed for doctor, denied for others; doctor closure empties slots; conflict count reported | 7 | **6** | reset -> seed -> `npm run dev` -> `npx tsx scripts/test-phase6.ts` [changelog.md:777-778] | Manual |
| `scripts/test-phase7.ts` | `sendSms` dry-run with no network; confirmation logs via receptionist session; `sms_logs` insert denied to patient and doctor; failure path writes `failed`; reminder route 401 without secret; reminder window picks only ~24h appointment; `find-or-create` rejects foreign `profileId`; doctor cannot create appointment | 10 | **8** | reset -> seed -> `npm run dev` -> `npx tsx scripts/test-phase7.ts` [changelog.md:880-881] | Manual |
| `scripts/test-phase8.ts` | No-show split attended/marked/inferred, future excluded; SMS report counts; appointment summary status/source; scope correctness for doctor (SMS zeros) and reports not rejected | 5 | **4** | reset -> seed -> `npm run dev` -> `npx tsx scripts/test-phase8.ts` [changelog.md:944-945] | Manual |
| `scripts/test-phase9.ts` | Anon reads `doctor_availability`; anon cannot write it; authenticated doctor read/write regression | 4 | **3** | `npx tsx scripts/test-phase9.ts` (anon client, no dev server needed; needs seeded staff for check 3) [scripts/test-phase9.ts] | Manual |
| `scripts/test-fee-collections.ts` | Amount through confirm; confirm without amount; negative amount rejected; walk-in with amount; pay-after attendance; no-show drops amount; patient insert with payment fields rejected; collections totals; fee setting round-trip | 10 | **9** | `npm run dev` -> `npx tsx scripts/test-fee-collections.ts` [scripts/test-fee-collections.ts:7-11]; the file makes no HTTP calls itself | Manual |
| `scripts/test-senior-priority.ts` | Discount math (20% of 500, rounding, clamps, gap); patient self-flag allowed; cross-patient denied; receptionist can flag; setting reads/updates; confirm stores 400/100; walk-in stores 350/150; attendance stores pay-after discount; negative discount rejected; collections `discountsGranted` sums 350; join exposes the flag; patient self-insert with discount refused | 13 | **12** | `npm run dev` -> `npx tsx scripts/test-senior-priority.ts` [scripts/test-senior-priority.ts:9-12]; no HTTP calls in the file | Manual |
| `scripts/test-reschedule.ts` | PENDING move keeps row; CONFIRMED move into vacated slot; `SAME_SLOT`; `SLOT_TAKEN`; `CLOSED_DATE`; `PAST_APPOINTMENT` (earlier date and already-started today); move into passed today-time; `ALREADY_CANCELLED`; patient session denied and row untouched; CONFIRMED move re-texts in dry-run | 14 | **13** | reset -> seed -> `npx tsx scripts/test-reschedule.ts`; no dev server needed [scripts/test-reschedule.ts:8-10] | Manual |
| `scripts/test-reschedule-browser.ts` | Real Chromium: receptionist signs in, today's upcoming row shows **Move**, dialog opens, slot picked, move succeeds with both times, DB row moved, PENDING move sends no SMS, no page errors | 11 | **9** | `npx tsx scripts/test-reschedule-browser.ts`; dev server and dry-run required [scripts/test-reschedule-browser.ts:1-13] | Manual |
| `scripts/test-smoke-e2e.ts` | Browser end-to-end: staff account ready; signup lands on `/patient`; booking prefilled; slots load; receipt shown; patient row created with canonical phone and profile link; appointment `PENDING`/`online`; receptionist login; pending request visible; SMS banner; appointment `CONFIRMED` with payment; exactly one `sent` confirmation log; no uncaught page errors | 14 | **13** | `npx tsx scripts/test-smoke-e2e.ts`; dev server must be running [scripts/test-smoke-e2e.ts:1-20] | Manual |

### Other test-like scripts

| Script | What it is | Count | How it is run |
|---|---|---|---|
| `scripts/probe-sms-response-shapes.ts` | Offline regression probe for the Semaphore response parser: v4 array success, object error, HTTP-200 in-band failure, legacy object success. Injects a fake `fetch`, zero network, bypasses dry-run | **4** checks (5 `report(` lines minus the definition) [scripts/probe-sms-response-shapes.ts] | `npx tsx scripts/probe-sms-response-shapes.ts` |
| `scripts/screenshot-review.mjs` | Render sweep: 13 routes x 2 viewports (desktop 1440x900, mobile 390x844) = **26 route/viewport combinations**. Per combination it asserts HTTP < 400, no unexpected redirect for a role route, exactly one `h1`, no stuck "Loading", no error-boundary text, no page error, no console error; writes PNGs to `.impeccable/review/` | **26** combinations, 0 `report()` checks (assertions are accumulated into a per-combination notes array) [scripts/screenshot-review.mjs] | `node scripts/screenshot-review.mjs`; dev server and seeded staff required |
| `scripts/test-support.ts` | Shared fixture cleanup (`resetTestState`) and test phone/date registry; no checks | 0 [scripts/test-support.ts] | Imported by harnesses |
| `scripts/seed-staff.ts` | Staff account seeder, not a test | 0 [scripts/seed-staff.ts] | `npx tsx scripts/seed-staff.ts` |

### Totals

- 13 harness scripts contain **112 distinct checks**.
- Smoke test: **13 checks** (`scripts/test-smoke-e2e.ts`).
- Render sweep: **26** route/viewport combinations (`scripts/screenshot-review.mjs`).
- Adding the 4 offline SMS-parser probes gives **116** executable checks, not counting the 26 render combinations.
- There is no `test` script in `package.json`; scripts are `dev`, `build`, `start`, `lint` only [package.json]. Nothing runs automatically and there is no CI configuration [no `.github` directory; grep of the repo].
- Note: the two harnesses whose header says to start `npm run dev` (fee collections, senior priority) make no HTTP requests in the file; the dev-server requirement in their headers is not exercised by their code [scripts/test-fee-collections.ts; scripts/test-senior-priority.ts].

---

## 10. Not built / known gaps

| Item | Status and evidence of absence |
|---|---|
| Hosting / production deployment | Not built. No `vercel.json`, `netlify.toml`, `Dockerfile` or `docker-compose` file exists (`ls` returned none); `PRODUCT.md` states production hosting is Phase 10 and has not started; `progress.md` lists deployment as "Not started" [PRODUCT.md; progress.md:38]. |
| CI / automated test runner | Not built. No `.github` directory, no `npm test` script, no CI config; harnesses are run by hand [package.json; directory listing]. |
| MFA / 2FA | Not built. TOTP and phone MFA are both disabled in config; no `mfa`/`totp`/`2fa` code under `src` [supabase/config.toml:297-318; grep of `src`]. |
| Password reset / "forgot password" | Not built. No `resetPasswordForEmail` call and no link or form in `src` [grep of `src`]. |
| Email notifications | Not built. No `nodemailer`, `sendgrid`, `resend`, `mailgun`, `postmark` or SMTP client in `src`, `scripts` or `package.json`; Supabase's local SMTP only captures auth emails [grep; supabase/config.toml:105-108]. |
| Online payments / gateway / refunds / installments | Not built. No `stripe`, `paymongo`, `paypal`, payment-intent or checkout code; payment is manual reference logging only [grep of `src`; PRODUCT.md]. |
| Multi-clinic / multi-tenant / multi-branch | Not built. No `tenant` or `clinic_id` column in `src` or `supabase`; the only matches are comments in `config.toml` [grep of `src` and `supabase`; PRODUCT.md]. |
| Automated day-before reminder scheduling | Not built. The route exists but nothing calls it on a schedule: no `vercel.json`, no `pg_cron`, no `cron.schedule`; the spec defers scheduling to the deployment phase [specs/phase-7-semaphore-sms.md:25,128; grep]. |
| SMS delivery receipts / webhook / retry for confirmations | Not built. `sms_status` has only `sent`/`failed`; the code stores provider acceptance (`message_id`) or an error, never a later delivery state; confirmation failures are logged and not retried [supabase/migrations/20260823173553_phase1_schema.sql:12; src/lib/sms/send-sms.ts; src/lib/sms/send-confirmation.ts]. |
| SMS log viewer in the UI | Not built. No page or component selects from `sms_logs`; only banners/toasts reflect the send result [grep of `src`]. |
| SMS-delivery report card | Removed. `/receptionist/reports` does not import `getSmsReport`; the changelog records the removal [src/app/receptionist/reports/page.tsx; changelog.md:95-97]. |
| Actor / audit trail for every state change | Not built. There is no audit table and no `actor_id`/`changed_by` column; `appointments.handled_by` is filled only on walk-in creation and never on confirm, cancel, reschedule or attendance [supabase/migrations/20260823173553_phase1_schema.sql:58; src/lib/booking/update-appointment.ts; src/lib/booking/reschedule-appointment.ts]. |
| Staff/user management UI | Not built. No page lists or edits users; roles are assigned only by `scripts/seed-staff.ts` or direct service-role access [directory listing of `src/app`; scripts/seed-staff.ts]. |
| Patient profile editing UI | Not built. No page updates `profiles` or `patients` after signup, although RLS allows a patient to update their own rows [grep for `updateUser` and `from("profiles").update` returned none; supabase/migrations/20260823180000_phase2_auth_rls.sql]. |
| Patient self-service reschedule/cancel | Not built by design. No patient update policy and no controls on `/patient/appointments`; the page tells patients to call the front desk [src/app/patient/appointments/page.tsx:145; supabase/migrations/20260823180000_phase2_auth_rls.sql:112-116]. |
| Waitlist, Google Calendar, telemedicine, insurance, EMR, doctor leave/bulk reschedule | Not built. Case-insensitive searches for `waitlist`, `google calendar`, `telemedicine`, `insurance`, `emr`, `rescheduleRequest` return no application code [grep of `src`, `package.json`, `supabase/migrations`]. |
| Server-side validation of time against working hours | Not implemented. `createAppointment` checks only closed dates, not `doctor_availability`, so the slot list is a UI convenience rather than a database rule [src/lib/booking/create-appointment.ts; src/lib/booking/get-available-slots.ts]. |
| Pagination / search on appointment lists | Not implemented. The receptionist and patient pages load all matching rows into memory [src/hooks/use-appointments.ts; src/app/patient/appointments/page.tsx]. |
| Public `/api/health` protection | Not implemented. The route has no auth check and uses the service-role client to return availability rows [src/app/api/health/route.ts]. |
| Un-marking attendance | Not implemented. There is no UI path to clear `attendance` once set [src/app/receptionist/appointments/page.tsx:320]. |
| Doctor identity in the schema | Not modeled. `doctor_availability` has no doctor/profile id; with one doctor this is consistent with the product, but the table cannot distinguish doctors [supabase/migrations/20260823173553_phase1_schema.sql:37-45]. |
| Production environment / real data / pilot | Does not exist. `PRODUCT.md` and `progress.md` both state all data is local test data and no hosted project exists [PRODUCT.md; progress.md]. |

---

## 11. Conflicts and stale docs

| # | Document says | Code says | Which the code supports |
|---|---|---|---|
| 1 | `PRODUCT.md`: "every state change attributable to a real identity" | No audit columns; `appointments.handled_by` exists but is only written on walk-in creation. Confirm, cancel, reschedule and attendance writes record no actor | Code: attribution is partial [supabase/migrations/20260823173553_phase1_schema.sql:58; src/lib/booking/update-appointment.ts; src/lib/booking/reschedule-appointment.ts] |
| 2 | `docs/project2/MASTER-CONTEXT.md`: "Every confirmation and day-before reminder sends by SMS and writes its own delivery record" | Confirmations are sent only when a receptionist action calls the route; reminders are sent only when someone calls the protected cron route manually. No scheduler exists. In dry-run, no SMS leaves the machine | Code: the endpoints exist, the scheduled sending does not [src/app/api/sms/send-confirmation/route.ts; src/app/api/cron/send-reminders/route.ts; specs/phase-7-semaphore-sms.md:25] |
| 3 | `docs/project2/MASTER-CONTEXT.md`: "Thirteen test harness scripts cover roughly 113 scripted checks" | 13 harness scripts contain 112 distinct checks by the count in section 9 ("roughly" makes this a minor drift, not a false claim) | Code: 112 [count method and per-file table in section 9; scripts/test-*.ts] |
| 4 | `progress.md`: "phase harnesses are reset-required (they fail on a used DB)" | `resetTestState()` is imported and called by 11 of the 13 harnesses specifically so a prior run does not collide; the two browser harnesses perform their own cleanup instead. Whether every suite in fact passes on a non-fresh DB is UNVERIFIED because the suites were not run | Code supports the cleanup design, not the "must reset" claim [scripts/test-support.ts:1-32; scripts/test-smoke-e2e.ts:120-130; grep for `resetTestState`] |
| 5 | Phase 8 spec: an SMS delivery success/failure report is one of the required reports | `/receptionist/reports` has no SMS card; `getSmsReport` exists but is unused. The changelog records the card's removal at human request | Code: report was dropped; the spec is stale [specs/phase-8-reports.md:13; src/app/receptionist/reports/page.tsx; changelog.md:95-97] |
| 6 | `/receptionist/reports` page lead: "... and whether the texts actually went out" | No SMS delivery content is rendered on the page | Code contradicts its own copy; the masthead string is stale [src/app/receptionist/reports/page.tsx:125] |
| 7 | `PRODUCT.md` / `MASTER-CONTEXT.md`: SMS confirmations and reminders are "delivered and logged" | Dry-run writes `status = sent` and `provider_response = "dry-run success"` without any provider call. The log therefore records an attempt, not a delivery | Code: "sent" cannot be read as "delivered" [src/lib/sms/send-sms.ts; src/lib/sms/send-confirmation.ts; .env.local.example:10] |
| 8 | `docs/Master_Handoff_DEMO_COPY.md`: "Semaphore returns a delivery status the system logs" | The code logs the provider's acceptance (`message_id=...`) or an error string; it does not poll or receive a later delivery status, and the enum has no "delivered" value | Code: acceptance/error logging only [src/lib/sms/send-sms.ts; supabase/migrations/20260823173553_phase1_schema.sql:12] |
| 9 | Phase 7 spec: scheduling the reminder route is "Phase 9's job" | `progress.md` reassigns Phase 9 to landing/branding and puts deployment in Phase 10; Phase 10 has no spec and never started. Scheduling was therefore never built | Code: no scheduler; the plan itself was renumbered [specs/phase-7-semaphore-sms.md:25; progress.md:38] |
| 10 | `docs/project2/MASTER-CONTEXT.md`: "@supabase/ssr cookie sessions with middleware refresh" | There is no `middleware.ts`; session refresh is implemented in Next 16's `src/proxy.ts`, which calls the same `updateSession` helper | Code: proxy convention; terminology only, behavior matches [src/proxy.ts; src/lib/supabase/middleware.ts] |
| 11 | `PRODUCT.md`: "Three roles, one shared app (role-gated by database RLS)" | RLS enforces data access, but route access is additionally gated in the layouts by `requireRole`, and `/api/health` is unauthenticated and service-role backed | Code: RLS is the authority for data; the UI and one route have their own rules [src/lib/auth/require-role.ts; src/app/api/health/route.ts] |
| 12 | `PRODUCT.md`: doctor "manages weekly working hours and one-off closed dates" (implied to be the doctor's own data) | `doctor_availability` and `availability_exceptions` have no doctor id; any session with role `doctor` edits the single global schedule | Code: single global schedule, consistent with the one-doctor setting but not per-doctor [supabase/migrations/20260823173553_phase1_schema.sql:37-45] |

---

### UNVERIFIED items

The following could not be checked without running the stack, so they are marked UNVERIFIED rather than asserted: the actual running PostgreSQL server version (config declares major version 17), the installed Supabase CLI version (the file records latest `v2.121.0`), whether the local Supabase stack is currently running, whether all 8 migrations apply cleanly on this machine today, whether each harness currently passes and whether the suites `progress.md` calls "reset-required" really fail on a used database, whether a real (non-dry-run) Semaphore send succeeds from this environment, whether any real SMS was ever delivered, whether `tsc`, ESLint and `next build` are currently clean, and the real values of the seven environment variables (only the variable names were read; no secret values were printed).
