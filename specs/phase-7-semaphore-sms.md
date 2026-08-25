# Phase 7 — Semaphore SMS

**Spec author:** Claude Chat
**Status:** Ready for OpenCode plan mode
**Built against:** `changelog.md` Phase 6 entry (real repo state)
**Corrects:** Addendum A.4's original `pg_cron` proposal — see §0.1 below.
**Feeds into:** Phase 8 (Reports, needs `sms_logs` data to be real). Phase 9 (deployment) needs to actually schedule the reminder route this phase builds — see §3.3.

---

## 0. Objective

By the end of this phase:
- Confirming an online request (Phase 4's Pending Requests tab) sends a real SMS confirmation and logs the outcome — closing the "no SMS sent" placeholder both Phase 4 and Phase 5 explicitly left open.
- A reminder mechanism exists for `CONFIRMED` appointments ~24h out, exposed as a protected HTTP endpoint that a real scheduler can call — the scheduling itself is Phase 9's job, not this phase's.
- Failed sends are logged, never retried automatically — this is FR5a's requirement, not a limitation to work around.
- **Nothing in this phase's automated tests spends real SMS credits.** A dry-run mode is the default; one deliberate, manual, real send is the only place actual money moves, and it's called out explicitly as a one-time check, not something the repeatable harness does.

---

## 0.1 Correcting Addendum A.4 — the reminder trigger is an HTTP route, not `pg_cron`

A.4 proposed `pg_cron` querying the DB directly for reminders, reasoning it avoided "unnecessary external dependencies." Revisiting that now that deployment is actually being planned: local Supabase's `pg_cron` has a documented setup problem (a `cron.database_name` misconfiguration that can outright block `supabase start`), and making it actually *call* Semaphore's API requires `pg_net` plus, in the standard pattern, a Supabase Edge Function — an entirely separate Deno runtime this project has never used, with its own deploy story independent of the Next.js app.

**Revised approach:** a protected Next.js route handler, `/api/cron/send-reminders`, that does the query-and-send in plain TypeScript using code this project already has every pattern for. Locally, it's triggered manually (a `curl` with the right header — see §3.3's test). Once deployed, Phase 9 wires an actual scheduler to hit it — Vercel Cron if that's the hosting choice (a `vercel.json` entry, inert until deployed, not a bug), or any other host's cron feature, or even a free external cron-ping service if the eventual host has none built in. The route itself doesn't care who calls it, only that they have the secret.

This is a genuine reversal of a documented decision, not just an implementation detail — flagging it the same way A.4 itself was flagged when it replaced the original design doc's unresolved "or" on this exact question.

---

## 1. Environment & config

Add to `.env.local.example`:

```
SEMAPHORE_API_KEY=
SEMAPHORE_SENDER_NAME=
SEMAPHORE_DRY_RUN=true
CRON_SECRET=
```

`SEMAPHORE_DRY_RUN=true` is the committed default in the example file — anyone cloning this repo and following setup should get a safe-by-default local environment, not one that silently spends money the first time someone tests the confirm flow.

---

## 2. Migration: `supabase/migrations/<timestamp>_phase7_sms_insert_policy.sql`

One small addition — `sms_logs` has had a receptionist-only `SELECT` policy since Phase 2 but no `INSERT` policy for any client role, meaning writing a log entry has no path except `admin.ts`. Rather than add a third service-role carve-out (Phase 3's handoff notes flagged that a third one should prompt reconsidering the RLS shape, not just working around it again), extend the existing policy shape:

```sql
create policy "sms_logs_insert_receptionist" on sms_logs
  for insert to authenticated with check (public.get_my_role() = 'receptionist');
```

This covers the confirmation-SMS path (§3.1, runs on the receptionist's own session). The reminder route (§3.2) is a different category entirely — it has no user session at all, being system-triggered, so `admin.ts` there isn't a workaround, it's the correct and only applicable tool. Worth being precise about that distinction rather than lumping both under "another admin.ts exception."

---

## 3. SMS sending logic

### 3.1 `src/lib/sms/send-sms.ts`

```ts
export async function sendSms(input: { number: string; message: string }):
  Promise<{ success: true; messageId: string } | { success: false; error: string }>
```

Posts to Semaphore's `https://semaphore.co/api/v4/messages` with `apikey`, `number`, `message`, and `sendername` (from env). If `SEMAPHORE_DRY_RUN=true`, skip the HTTP call entirely, log the would-be payload to the console, and return a synthetic success — this is what makes the automated harness safe to run repeatedly.

### 3.2 `src/lib/sms/send-confirmation.ts`

```ts
export async function sendConfirmationSms(
  supabase: SupabaseClient,   // caller's own session — receptionist, per §2's new policy
  appointmentId: string
): Promise<{ logged: true; delivered: boolean }>
```

Loads the appointment + patient phone, calls `sendSms`, writes one row to `sms_logs` (`type: 'confirmation'`, `status: 'sent' | 'failed'`, `provider_response`) regardless of outcome. **Does not throw on SMS failure** — a failed text should never undo or block the appointment confirmation that already succeeded in Phase 4's `confirmAppointment`; it only gets logged, matching FR5a exactly (log the failure, no auto-retry, no cascading failure into the booking itself).

**Called from the UI as a separate step after `confirmAppointment` succeeds** (Phase 4's confirm dialog), not merged into that function — keeps Phase 4's already-tested function untouched, same additive discipline as Phase 4 used on Phase 3's `createAppointment`.

### 3.3 `src/app/api/cron/send-reminders/route.ts`

```
GET /api/cron/send-reminders
Header: Authorization: Bearer <CRON_SECRET>
```

Rejects with 401 if the header doesn't match `CRON_SECRET` — same "gate anything admin.ts-backed" discipline OpenCode raised (and I agreed with) back in Phase 3, now applied to a route that can spend real money if left open, which makes the gate more important here, not less.

On a valid call: uses `admin.ts` (correct here — no user session exists to bind to), queries `CONFIRMED` appointments where `appointment_date` is ~24h from now, calls `sendSms` for each (respecting `SEMAPHORE_DRY_RUN`), writes an `sms_logs` row per attempt (`type: 'reminder'`) via the admin client. Returns a summary count, not per-row detail — this is a machine-triggered endpoint, not a UI.

---

## 4. UI changes

### 4.1 Receptionist confirm dialog (Phase 4)

Remove the "no SMS sent (not yet implemented)" note. After `confirmAppointment` succeeds, call `sendConfirmationSms` and toast the result — success or "SMS failed to send (logged)," never a blocking error, since the confirmation itself already succeeded and shouldn't read as failed just because the text didn't go out.

### 4.2 Patient dashboard (Phase 5)

**No change.** Its existing copy ("staff will contact you…") describes the *submission* step, before any confirmation exists to text about — still accurate, nothing to update here.

---

## 5. Test Cases

**Automated (`scripts/test-phase7.ts`), dry-run only — this harness must never require real Semaphore credits to pass:**

1. `sendSms` in dry-run mode returns success without making an HTTP call (verify no network call attempted, not just that it returns success).
2. `sendConfirmationSms` writes a correctly-typed `sms_logs` row for a real seeded appointment, via a receptionist session.
3. `sms_logs` insert is rejected for patient/doctor sessions (RLS, per §2's new policy scope).
4. `sendConfirmationSms`'s failure path (simulate by pointing at a malformed phone, or a dry-run "simulate failure" flag if that's cheap to add) still writes a `'failed'` row and does not throw.
5. `/api/cron/send-reminders` returns 401 without the correct `Authorization` header.
6. `/api/cron/send-reminders` with the correct header (dry-run mode) correctly identifies only the `CONFIRMED` appointments in the ~24h window — seed one appointment inside the window and one outside it, confirm only the former gets a dry-run reminder logged.

**Manual — the one deliberate real-money test, done once, not part of the repeatable suite:**

7. Set `SEMAPHORE_DRY_RUN=false` locally with a real API key and your own phone number as a test patient's contact, confirm a real online request through the receptionist dashboard, and confirm the SMS actually arrives. Set `SEMAPHORE_DRY_RUN` back to `true` afterward.
8. `curl` the reminder route manually with the correct `CRON_SECRET` against a seeded appointment dated ~24h out, confirm it behaves as expected (dry-run is fine for this one — the point is testing the route logic and the time-window query, not re-proving Semaphore delivery works).

---

## 6. Explicitly deferred to later phases

- Actually scheduling `/api/cron/send-reminders` to run automatically — that's Phase 9, once a host is chosen. This phase only builds the endpoint and proves it works when called.
- Reports on `sms_logs` data (Phase 8, FR9).
- A.5's no-show default-on-report-query — also Phase 8, per the addendum's own table.

---

## 7. Handoff notes for OpenCode plan mode

- **§0.1 is a real reversal of a prior decision**, not a style preference — if plan mode has opinions on `pg_cron` vs. a route handler, that's worth surfacing here before building either way, but the reasoning (documented local setup friction + an unused Edge Functions runtime + an already-Next.js-shaped codebase) should be treated as the default unless something concrete argues against it.
- **`SEMAPHORE_DRY_RUN` defaulting to `true` in the committed example file is deliberate, not a placeholder to "clean up" before shipping.** It should stay off by default even after this phase closes — real Semaphore credits are only spent by a human deliberately flipping it for Test 7, never by routine test runs.
- The reminder route's admin.ts usage is categorically different from Phase 3's two exceptions (§2 makes this explicit) — don't flag it as a "fourth workaround," it's the first genuinely no-session case this project has had.
