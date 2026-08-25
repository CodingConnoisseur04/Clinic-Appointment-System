# Phase 8 — Reports

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 7 entry (real repo state)
**Resolves:** Addendum A.5 (no-show default for reporting), FR9 (operational reports), FR5a's SMS logging finally gets a UI to be seen through.
**Feeds into:** Phase 9 (deployment) — the last feature phase closing means Phase 9 is the last spec after this one.

---

## 0. Objective

By the end of this phase, the receptionist — and only the receptionist, per the stakeholder table's original assignment of report-viewing to that role, not the doctor — can see three date-range-filterable reports built entirely from data every prior phase has already been generating: appointment volume by status, SMS delivery success/failure, and a no-show rate that correctly implements Addendum A.5's resolution (an unmarked past appointment counts as a no-show *for the report*, without ever writing that assumption into the actual `attendance` column).

No new tables, no new RLS policies — every table this phase reads from already has the right access shape from Phases 2, 3, and 7.

---

## 1. Shared logic

Same DI shape as every prior lib module — caller's own RLS-bound session, no admin.ts needed. Both `appointments_select_staff` (Phase 2) and `sms_logs_select_receptionist` (Phase 2) already give the receptionist unrestricted read access to exactly what these reports need.

### 1.1 `src/lib/reports/get-no-show-report.ts`

```ts
export async function getNoShowReport(supabase: SupabaseClient, range: { from: string; to: string }):
  Promise<{ attended: number; noShowMarked: number; noShowInferred: number; noShowRatePercent: number; totalPastConfirmed: number }>
```

Queries `appointments` where `status = 'CONFIRMED'` and `appointment_date` is within range **and on or before today** — a future `CONFIRMED` appointment isn't a no-show candidate yet, it just hasn't happened. Of those:
- `attended` — `attendance = 'ATTENDED'`
- `noShowMarked` — `attendance = 'NO_SHOW'`
- `noShowInferred` — `attendance IS NULL` (this is Addendum A.5's resolution, option (b): computed here, at query time, never written back to the row)
- `noShowRatePercent` = `(noShowMarked + noShowInferred) / totalPastConfirmed * 100`

Report the marked/inferred split visibly in the UI (§2), not just a combined rate — a receptionist should be able to tell "these no-shows were confirmed by someone actually checking" from "these are appointments nobody ever went back and marked," since the second category might just mean the receptionist forgot to update the record, not that the patient didn't show.

### 1.2 `src/lib/reports/get-sms-report.ts`

```ts
export async function getSmsReport(supabase: SupabaseClient, range: { from: string; to: string }):
  Promise<{ confirmationSent: number; confirmationFailed: number; reminderSent: number; reminderFailed: number }>
```

Groups `sms_logs` in range by `type` and `status` — straightforward counts, no derived logic. This is the first UI anything in the project has had for FR5a's log — up to now it's only ever been checked via direct DB queries in test harnesses.

### 1.3 `src/lib/reports/get-appointment-summary.ts`

```ts
export async function getAppointmentSummary(supabase: SupabaseClient, range: { from: string; to: string }):
  Promise<{ pending: number; confirmed: number; cancelled: number; online: number; walkIn: number }>
```

Counts by `status` and, separately, by `source`, for appointments created (not necessarily scheduled) within the range — a basic volume/mix view, the kind of number a clinic would want before the no-show or SMS detail means much on its own.

---

## 2. UI — fourth tab on the existing receptionist dashboard

`src/app/receptionist/page.tsx` already has three tabs (Phase 4) under `requireRole(['receptionist'])` (Phase 4's layout) — add a fourth, **Reports**, rather than a new route. Same "one page, tabs, no new URLs for things that don't need their own" instruction every prior phase has repeated, and it means no new role-guard code is needed either — the existing layout already covers it.

Contents: a date-range picker (reuse the shadcn `Calendar` already in the codebase since Phase 1) defaulting to the last 30 days, and three cards (shadcn `Card`, also already installed) — one per report — showing the numbers from §1's functions. Keep this plain: numbers and short labels, no charting library. A course-project reports tab doesn't need a graphing dependency to be useful, and adding one is scope this spec isn't asking for.

---

## 3. Test Cases

**Automated (`scripts/test-phase8.ts`), same real-session pattern as every prior phase — seed a deliberate mix of data first, since these reports are meaningless against arbitrary leftover state:**

Seed, via already-tested functions from earlier phases (not raw SQL where a lib function already exists for it): one past `CONFIRMED` appointment marked `ATTENDED`, one past `CONFIRMED` marked `NO_SHOW`, one past `CONFIRMED` with `attendance` left `null`, one *future* `CONFIRMED` appointment (must NOT count toward the no-show rate), plus a couple of `sms_logs` rows of each type/status via Phase 7's `sendConfirmationSms` (with `simulateFailure` for the failed case).

1. `getNoShowReport` correctly separates `attended` / `noShowMarked` / `noShowInferred`, excludes the future appointment from `totalPastConfirmed`, and computes the rate correctly.
2. `getSmsReport` counts match the seeded mix exactly.
3. `getAppointmentSummary` status and source counts match the seeded mix.
4. **Scope-correctness, not "rejection"** — learned from Phase 6's Test 2 reframe: don't assert these functions are "denied" for non-receptionist sessions, since RLS *scopes* rather than blocks for some roles. Assert instead what each role's session actually returns when calling these same functions: a doctor's session (via `appointments_select_doctor`) would only ever see the `CONFIRMED` subset, never the full picture these reports need, and has no `sms_logs` access at all (`getSmsReport` returns all zeros, not an error) — confirm these are *incomplete*, not that they error, matching how RLS actually behaves for that role rather than assuming a rejection pattern.

**Manual, browser-based:**

5. Log in as the receptionist, open the Reports tab, confirm the three cards render sensible numbers against real data accumulated from all the manual testing done across Phases 4–7.
6. Change the date range, confirm all three reports update correctly.
7. Confirm a patient or doctor account has no way to reach this tab at all (it's not that the report functions reject them — nothing in the doctor or patient dashboards exposes this UI in the first place).

---

## 4. Explicitly deferred / out of scope

- Any report beyond the three specified — if FR9's original wording implied more, revisit against the actual design doc rather than this spec inventing additional metrics.
- Charting/visualization — plain numbers are the scope here.
- Exporting reports (CSV, PDF, etc.) — not requested anywhere in the design, not being added speculatively.
- Deployment (Phase 9) — the last remaining spec after this one.

---

## 5. Handoff notes for OpenCode plan mode

- **§1.1's `noShowInferred` must never write to the `attendance` column** — this is the whole point of Addendum A.5's option (b) over option (a). If plan mode's implementation touches the database at all while computing this report, that's a regression to the addendum's actual resolution, not a minor optimization.
- **Test 4 is written the way it is deliberately, per Phase 6's own lesson** — don't let it regress back to asserting "rejected" if a first draft of the harness naturally reaches for that framing; check what the role's RLS scope actually returns before asserting anything.
- No new routes, no new RLS policies, no new tables — if plan mode proposes any of those, that's a signal something in this spec's "everything needed already exists" assumption is wrong, worth surfacing before building rather than after.
