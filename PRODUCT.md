# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three roles, one shared app (role-gated by database RLS):

- **Patient** — registers online, submits appointment requests, sees own history read-only. Cannot self-confirm, cancel, or reschedule.
- **Receptionist** — the operational hub: confirms/rejects online requests after arranging payment out-of-band, books walk-ins with immediate confirmation and payment logging, marks attendance, cancels appointments, views reports.
- **Doctor** — single doctor; views confirmed schedule (read-only), manages weekly working hours and one-off closed dates.

Setting: a small single-doctor family clinic in the Philippines. Scale: ~200 patient records, ~3 staff.

## Product Purpose

Appointment scheduling for Golden Friendship Family Clinic. A deliberately **hybrid** system — not self-service: patients submit requests online, but confirmation always happens through the receptionist after payment is arranged out-of-band (cash or GCash reference logged manually). Walk-ins are booked at the desk in the same motion as payment. Success means: no double-booked slots ever (enforced at the database level), every state change attributable to a real identity, SMS confirmations/reminders delivered and logged, and an accurate no-show rate that distinguishes marked from unmarked records.

## Positioning

What a neighboring clinic tool could not truthfully copy: slot-conflict prevention enforced by the database itself (shared identically by online booking and walk-in booking), plus honest hybrid-flow semantics — the system never pretends a request is confirmed before staff act on it, and never silently cancels anything (cancellation is a status, preserving full history).

## Operating Context

- Local development runs Supabase via CLI + Docker (`npx supabase start`); production deployment is planned as Phase 9 but has not happened yet.
- Payment references are logged manually (receipt numbers / GCash ref strings); no money moves through this system.
- Notifications are SMS-only via Semaphore (dry-run by default in dev). No email channel exists.
- Staff re-seeding (`scripts/seed-staff.ts`) is required after any local database reset.
- Design/product truth lives in `docs/Master_Handoff_DEMO_COPY.md` + `docs/master-handoff-addendum-a.md`; phase history in `changelog.md`.

## Capabilities and Constraints

Confirmed capabilities: patient signup/login, online request submission against real availability, walk-in booking with instant confirmation + payment fields, attendance marking, cancellation (status change only — rows are never hard-deleted), doctor schedule view, availability/closure management, three receptionist reports (volume/mix, no-show rate with marked-vs-inferred split, SMS delivery).

Hard constraints:
- Explicitly out of scope forever: EMR, insurance claims, multi-branch, telemedicine, payment gateways, billing installments/refunds, doctor leave/bulk-reschedule, waitlisting, Google Calendar integration, patient self-service reschedule/cancel, email notifications.
- Patient-facing booking form must be completable in under 3 minutes.
- Role-based access is enforced by RLS; client-facing code paths never bypass it via service role.
- Must work well on both desktop and mobile browsers.
- One real person maps to exactly one `patients` record; phone-number reconciliation reuses existing walk-in records rather than duplicating.
- An unmarked past CONFIRMED appointment counts as a no-show for reporting only — never written back to the record.

## Brand Commitments

- Name: **Golden Friendship Family Clinic** — exact spelling is binding brand copy everywhere the product names itself (currently titled generically "Clinic Appointment System"; renaming to the real name is expected future work).
- No logo, colors, or fonts are committed yet; none exist to preserve.

## Evidence on Hand

- No testimonials, marketing assets, press, or imagery exist — future work must not fabricate any.
- Real usage data exists only in the local development database (test patients/appointments from phases 1–8 verification).
- Product-truth documents: `docs/Master_Handoff_DEMO_COPY.md`, `docs/master-handoff-addendum-a.md`.

## Product Principles

1. **The database is the authority.** Slot conflicts, role access, and identity rules live in RLS/constraints; UI guards are convenience, never the guarantee.
2. **Hybrid by design.** Never imply instant confirmation, self-service cancellation, or automated payments; copy must describe the actual human-in-the-loop flow.
3. **The front desk is the hub.** Every meaningful state change flows through the receptionist; design for their workflow speed first.
4. **Small-scale honesty.** ~200 patients, ~3 staff: prefer manual-but-visible over automated-but-opaque; no speculative features.
5. **SMS is the only channel.** Every notification promise in copy must match what actually sends; failures log visibly and never retry silently.

## Accessibility & Inclusion

Must be fully usable on mobile browsers (patients book on phones) and desktop (front-desk workflows). Phone number is the primary contact identifier — forms must treat it as required and validated. Standard web accessibility practices apply; no product-specific requirements beyond that have been established.
