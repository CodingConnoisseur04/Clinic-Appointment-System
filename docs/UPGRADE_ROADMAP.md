# Upgrade Roadmap — Next Features

> **Purpose:** handoff document for a FRESH chat. Everything a new session needs
> to plan and build the next features without re-reading the whole history.
> Written 2026-09-18 right after merging `feat/fee-collections` to main.
>
> **How to use this doc:** pick ONE feature, plan it with the human (ask
> questions — decisions marked ✅ are already settled; ❓ are open), create a
> feature branch, build, verify, update `changelog.md` + `progress.md`, and
> wait for the human's test before committing. Branch-per-feature, merge to
> main, delete the branch after merge.

---

## Context (read this first)

Small single-doctor family clinic appointment system (BSIT 4th-year course
project, System Integration & Architecture). Next.js 16 + Supabase (local
Docker via CLI — no hosted project yet), Tailwind v4 + shadcn/ui, Semaphore
SMS. Three roles (patient / receptionist / doctor), access enforced by RLS.
~200 patients, 3 staff scale. Full history in `changelog.md`; product truth
in `docs/Master_Handoff_DEMO_COPY.md` + `PRODUCT.md`; hard out-of-scope list
in `AGENTS.md` (never build: payment gateway, EMR, waitlisting, patient
self-reschedule/cancel, email, etc.).

The presentation pitch is **"Role-based staff access & priority support."**
Role-based access is done and solid. Priority support is feature 2 below.
There is also an agreed polish/cleanup track (features 3–5) because the
human self-describes the build as "brute force" and wants the whole system
upgraded before presenting. Timeline: 1–3 weeks.

### Done already (do NOT rebuild)

| Feature | State |
|---|---|
| Phases 1–9 (schema, auth/RLS, slot logic, receptionist, patient booking, doctor, SMS, reports, landing) | Merged, closed |
| Sidebar navigation, receptionist home/settings, CSV export | Merged |
| In-place reschedule (receptionist "Move") | Merged |
| **Fee collections** (2026-09-18): `payment_amount` column, fee field on confirm/walk-in/attendance, pay-after walk-in default, Collections report card, `consultation_fee` setting, fee in confirmation SMS, fee display on patient My Appointments, Semaphore response-shape fix | Merged to main `8623927` |

### Things the new chat MUST know

- **Workflow rules** live in `AGENTS.md` — changelog/progress after every
  build, no auto-commit, human tests first, max 2 retries per feature.
- **Run harnesses after touching DB or booking/sms/report code:**
  `npx supabase db reset` → `npx tsx scripts/seed-staff.ts` →
  `npx tsx scripts/test-fee-collections.ts` (and the relevant phase suite;
  Phase 7/8 suites are reset-required).
- **`SEMAPHORE_DRY_RUN=true` in `.env.local` is the default.** Only the
  human flips it for real-number tests. Never send real SMS in harnesses.
- **Every new migration must GRANT explicitly** to anon/authenticated/
  service_role (this CLI grants nothing automatically), and every new table
  needs RLS + policies. Timestamps must sort after the latest migration
  (`20260918000000_fee_collections.sql` is current).
- **tsx resolves the `@/*` alias** — harnesses import real src/lib modules.
- **Design system:** "Warm Confidence" — gold marks money/time/next-action
  only, Geist Mono `.figure` class for all data (times, money, phones,
  references), `formatPeso()` for peso amounts. Match it; don't invent.
- **SMS charset:** ASCII-safe only in message bodies ("PHP 500" not "₱500" —
  ₱ forces UCS-2 = 3 credits and can garble).
- The DB currently holds fee-harness fixture rows (4 paid appointments,
  patient "Fees A") so the Collections card shows split numbers in demos.

---

## Feature 2 (NEXT): Senior/PWD priority support

This is the **"priority support" of the presentation pitch** — tie it to
RA 9994 / RA 10754 (20% senior/PWD discount mandate) for a defensible story.

### ✅ Settled decisions (from planning conversations — do not re-litigate)

1. **Meaning of "priority support":** senior citizens and PWDs get a
   priority lane + fee discount. One combined flag (senior OR PWD), not
   separate categories — keep it simple at this scale.
2. **Discount is configurable in Settings** (`senior_discount_percent`,
   default 20). Auto-computes the discounted amount as a *prefill* in the
   fee field; the receptionist can always override per appointment.
3. **The flag lives on `patients`** (a person is senior/PWD, not an
   appointment). Signup gets an optional checkbox; walk-in form gets one
   too; receptionist can also toggle it on an existing patient record.
4. **Priority surfaces as visibility, not scheduling overrides:** a badge +
   a separated/pinned section in the pending queue and on the day's
   schedule. It does NOT let seniors take occupied slots or jump the slot-
   conflict rule — the DB slot constraint stays the single authority.
5. **Discount math happens in the payment dialogs** (confirm / walk-in paid
   / attendance pay-after): when the patient row has the flag, prefill
   `fee × (1 − discount%)` instead of the flat fee.

### ❓ Open questions to ask the human before planning

- Should the priority lane also appear on the **doctor's schedule**, or only
  front-desk surfaces (receptionist is the hub; doctor view is read-only)?
- When a senior/PWD books online, should the **pending queue sort them
  first**, or only badge them (queue order = submitted order otherwise)?
- Discount display to patients: show "₱400 (20% senior discount)" on My
  Appointments / SMS, or keep discount private between desk and patient?
- Anything to show on the **Collections report** about discounts given
  (e.g. "discounts granted: ₱X in range")? Requires storing pre-discount
  amount or discount amount — decide storage shape during planning.

### Implementation sketch (adjust in planning)

- Migration: `alter table patients add column is_senior_pwd boolean not
  null default false;` + GRANTs; insert `senior_discount_percent` into
  `clinic_settings` (default '20').
- `clinic-settings.ts`: expose the new setting.
- Signup + walk-in forms: checkbox (label like "Senior citizen / PWD");
  walk-in lookup loads the flag with the rest of the record.
- Receptionist patients control: where? Simplest is an inline toggle on the
  pending/appointments rows' patient context, or a small field on the
  walk-in lookup result — ask the human which surface they want.
- Payment dialogs: when target patient has the flag, prefill discounted
  amount and show a one-line "20% senior discount applied — override if
  needed" note. Needs the patient's flag available at dialog time (join or
  extra fetch).
- Pending queue + schedule: gold `Senior/PWD` badge (Badge/StatusMark
  pattern exists); optionally a pinned "Priority" group at top of pending.
- Harness `scripts/test-senior-priority.ts`: flag set/get RLS, discount
  prefill math at lib level (compute function), badge data present in
  queries, default-20 from settings. Register any new phones in
  `test-support.ts`.

---

## Feature 3: Reports — charts & visual upgrade

### ✅ Settled

- Add real charts (bar/line/donut) instead of number cards + proportion
  bars; **Collections stays the first, most prominent card**.
- New report types wanted: **peak hours** (bookings per time slot), booking
  **source mix** (online vs walk-in over time), **cancellation rate**.
- Keep CSV export working; add the same new metrics to CSV where sensible.
- Library: **Recharts** (human approved "charts & visuals" direction;
  Recharts is the default shadcn-compatible choice — confirm at planning).

### ❓ Open

- Which chart type per metric (line for volume-over-time? donut for mix?)
  — propose during planning, let the human pick visuals.
- Print/PDF export was offered earlier and the human only picked "charts &
  visuals" — ask if print-friendly is still wanted (it was listed as a
  panel-handout idea).

---

## Feature 4: UX / user-flow polish (all surfaces)

The human said **all flows** feel weak: patient journey, receptionist hub
loop, doctor view, navigation/onboarding. Scope this by AUDIT FIRST:
walk each flow hands-on (dev server + screenshot harness
`node scripts/screenshot-review.mjs`, 13 routes × desktop/mobile), list
concrete weaknesses, present the list, let the human prioritize. Do not
redesign blindly.

Known weak spots already observed (verify, don't assume):
- Patient has no feedback loop after confirming beyond the SMS (no visible
  "your request was confirmed" state change emphasis beyond the badge).
- Receptionist pending queue has no sort other than date/time (feature 2
  may add priority pinning — coordinate).
- Doctor schedule is a plain table; no day/week navigation beyond Today/
  This Week toggle.
- Signup → booking hand-off could be smoother (new user lands on empty
  dashboard).
- Empty states exist but onboarding copy could better explain the hybrid
  flow (request → staff confirms → pay).

Design system constraints: "Warm Confidence" (see `.impeccable/design.json`
and changelog "Design pass 2/3"); mobile-first at 375px is a hard
requirement (Playwright screenshot harness asserts it).

---

## Feature 5: Architecture cleanup (LAST)

Diagnosis already done (2026-09-18). The data layer (`src/lib/**`) is
solid — typed functions, RLS-bound, no leaks. The debt is presentation-layer:

1. **God pages:** `receptionist/appointments/page.tsx` (~600 lines),
   `receptionist/walk-in/page.tsx`, `patient/book/page.tsx`,
   `receptionist/pending/page.tsx` — data + logic + markup fused.
   Extract dialogs/rows/sections into components as touched.
2. **Raw inline Supabase queries in pages:** receptionist home, patient
   appointments, `use-appointments` hook — consolidate into lib functions
   or hooks so `.from("appointments")` appears only in `src/lib/**`
   (+ test harnesses).
3. **Duplicate utils:** `todayStr()` in use-appointments.ts vs `todayIso()`
   in utils.ts; a stray `formatTime` in doctor/schedule (should be
   `formatTime12h`).
4. **Stale rows in progress.md** phase table (Phase 2 says "Built —
   awaiting test" though closed long ago).

Rules: behavior-identical refactor, tsc/lint/build + screenshot harness
26/26 + at least P3/P4/P5/fee suites green before/after. Do it LAST so
features 2–4 stop churning the same files. It shrinks naturally if each
feature extracts what it touches.

---

## Suggested order & why

**2 → 3 → 4 → 5.** Priority support is the pitch claim and needs the fee
field (done). Charts feed off collections + the new metrics. UX polish
after the data/feature layer settles. Cleanup last. Branch names:
`feat/senior-pwd-priority`, `feat/reports-charts`, `feat/ux-flow-polish`,
`feat/arch-cleanup`.

## Definition of done (every feature)

1. Migration (if any) applies clean on `db reset`; GRANTs + RLS included.
2. New harness passes; touched-area phase suites pass; tsc + lint + build
   clean; screenshot harness 26/26 if UI changed.
3. `changelog.md` entry (what/deviations/test table/known issues) +
   `progress.md` upgrade-track row updated.
4. Human tests manually → orders commit → commit message
   `Feat N: <name> — <one-line summary>` with changelog + progress in the
   same commit → merge to main → delete branch → progress row to "Closed."
