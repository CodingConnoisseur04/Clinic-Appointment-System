# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles, one shared app (role-gated by database RLS):

- **Patient**: registers online, submits appointment requests, sees own history read-only. Cannot self-confirm, cancel, or reschedule.
- **Receptionist**: the operational hub. Confirms or rejects online requests after arranging payment out-of-band, books walk-ins with immediate confirmation and payment logging, moves an existing appointment to a new slot (with an automatic re-confirmation SMS when the appointment was already confirmed), marks attendance, cancels appointments, logs the peso fee collected, and views reports.
- **Doctor**: single doctor. Views the confirmed schedule (read-only) and manages weekly working hours and one-off closed dates.

Setting: a small single-doctor family clinic in the Philippines. Scale: ~200 patient records, ~3 staff.

## Product Purpose

Appointment scheduling for Golden Friendship Family Clinic. A deliberately **hybrid** system, not self-service: patients submit requests online, but confirmation always happens through the receptionist after payment is arranged out-of-band (cash or GCash reference logged manually). Walk-ins are booked at the desk in the same motion as payment. Success means: no double-booked slots ever (enforced at the database level), every state change attributable to a real identity, SMS confirmations/reminders delivered and logged, and an accurate no-show rate that distinguishes marked from unmarked records.

## Positioning

What a neighboring clinic tool could not truthfully copy: slot-conflict prevention enforced by the database itself (shared identically by online booking and walk-in booking), plus honest hybrid-flow semantics: the system never pretends a request is confirmed before staff act on it, and never silently cancels anything (cancellation is a status, preserving full history).

## Operating Context

- Local development runs Supabase via CLI + Docker (`npx supabase start`). The system is built and tested on the local stack. Production hosting is Phase 10 and has not started, so no client runs on a hosted environment yet.
- Going live (Phase 10) still needs four decisions: guard the local-only scripts so they refuse a non-local project, settle the email-confirmation policy, choose a hosting platform with production redirect URLs, and set an SMS cost and testing plan.
- Payment references are logged manually (receipt numbers / GCash ref strings); no money moves through this system.
- Notifications are SMS-only via Semaphore. `SEMAPHORE_DRY_RUN=true` is the committed default and is currently set locally, so no real SMS leaves a development machine. No email channel exists.
- Staff re-seeding (`scripts/seed-staff.ts`) is required after any local database reset.
- Design and product truth lives in `docs/Master_Handoff_DEMO_COPY.md` and `docs/master-handoff-addendum-a.md`. The built record is `changelog.md`, the status table is `progress.md`, the design system is `DESIGN.md`, and the phase specs are in `specs/`.

## Capabilities and Constraints

Confirmed capabilities: patient signup/login, online request submission against real availability, walk-in booking with instant confirmation and payment fields, receptionist in-place reschedule of an existing appointment, attendance marking, cancellation as a status change (rows are never hard-deleted), doctor schedule view, availability and closure management, clinic settings (consultation fee, senior/PWD discount percent, receptionist phone, clinic name), a senior/PWD flag with discount prefill and badges, fee collections logging with a collections report and a per-day chart, peak-hours bars, a print handout style, CSV export, and a public landing page with live clinic hours.

Removed since: SMS delivery reporting no longer appears on the reports page (the reports upgrade dropped that card). Per-appointment failure banners plus the `sms_logs` table remain the operational view of delivery.

Hard constraints:
- Explicitly out of scope forever: EMR, insurance claims, multi-branch, telemedicine, payment gateways, billing installments/refunds, doctor leave/bulk-reschedule, waitlisting, Google Calendar integration, patient self-service reschedule/cancel, email notifications.
- Patient-facing booking form must be completable in under 3 minutes.
- Role-based access is enforced by RLS; client-facing code paths never bypass it via service role.
- Must work well on both desktop and mobile browsers.
- One real person maps to exactly one `patients` record; phone-number reconciliation reuses existing walk-in records rather than duplicating.
- An unmarked past CONFIRMED appointment counts as a no-show for reporting only, and is never written back to the record.

## Brand Commitments

- Name: **Golden Friendship Family Clinic**, in Cagayan de Oro City. The physician is presented publicly under the generic label **Clinic Physician**, with no personal name shown. This ships today: `src/lib/brand.ts` is the single source, read by the landing page, every masthead, and SMS copy. The exact spelling is binding everywhere the product names itself.
- Visual identity is committed in `DESIGN.md` (the Warm Confidence system): a deep forest field, a warm cream ground, and gold reserved for time, money, and the next thing that matters. DM Serif Display carries display type, Geist carries body text, and Geist Mono with tabular figures carries every time, date, count, phone number, and payment reference. There is no separate logo asset; the clinic name set in type is the mark.

## Evidence on Hand

- No testimonials, press coverage, or marketing claims exist. Future work must not fabricate any. Imagery exists as free-license Pexels photography with provenance recorded in `public/images/CREDITS.md`; the doctor portrait is a marked stand-in that must be replaced with a real photograph before launch.
- Real usage data exists only in the local development database: the test patients and appointments created by the phase harnesses, plus fixture rows currently left behind by the fee collections and senior/PWD harnesses so that demo reports show data. `resetTestState()` sweeps them. There is no production data, because there is no production environment.
- Product-truth documents: `docs/Master_Handoff_DEMO_COPY.md`, `docs/master-handoff-addendum-a.md`.

## Product Principles

1. **The database is the authority.** Slot conflicts, role access, and identity rules live in RLS/constraints; UI guards are convenience, never the guarantee.
2. **Hybrid by design.** Never imply instant confirmation, self-service cancellation, or automated payments; copy must describe the actual human-in-the-loop flow.
3. **The front desk is the hub.** Every meaningful state change flows through the receptionist; design for their workflow speed first.
4. **Small-scale honesty.** ~200 patients, ~3 staff: prefer manual-but-visible over automated-but-opaque; no speculative features.
5. **SMS is the only channel.** Every notification promise in copy must match what actually sends; failures log visibly and never retry silently.

## Accessibility & Inclusion

Must be fully usable on mobile browsers (patients book on phones) and desktop (front-desk workflows). Phone number is the primary contact identifier, so forms must treat it as required and validated. Standard web accessibility practices apply; no product-specific requirements beyond that have been established.
