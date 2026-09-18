/*
 * Regression probe for the Semaphore response-shape bug (2026-09-18).
 *
 * Semaphore v4 returns a JSON ARRAY on success: [{ message_id, ... }]. The
 * original parser expected a plain object, so REAL delivered sends were
 * classified as failures (false "failed" sms_logs rows and a lying banner in
 * the UI). This probe injects fake fetch responses — ZERO network calls, ZERO
 * credits — and asserts both shapes parse correctly.
 *
 * Run: npx tsx scripts/probe-sms-response-shapes.ts
 * (safe on any env: fetchImpl is injected, DRY_RUN is bypassed entirely)
 */
import { sendSms } from "@/lib/sms/send-sms";

let failures = 0;
function report(n: number, name: string, pass: boolean, detail = "") {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${tag}] Probe ${n}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function fetchReturning(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

async function main() {
  // Bypass the dry-run short-circuit so the injected fetch is exercised.
  // Still zero network — every send below uses fetchReturning, never real fetch.
  const dryRunBackup = process.env.SEMAPHORE_DRY_RUN;
  process.env.SEMAPHORE_DRY_RUN = "false";

  // Probe 1: the REAL v4 success shape — an array (captured verbatim from a
  // live send's provider_response in sms_logs).
  const arrayShape = [
    {
      message_id: 280509228,
      user_id: 74838,
      account_id: 74698,
      account: "CharizJames",
      recipient: "639197777001",
      status: "Pending",
      network: "Smart",
      type: "Single",
      source: "Api",
    },
  ];
  const r1 = await sendSms(
    { number: "09171234567", message: "probe" },
    fetchReturning(arrayShape)
  );
  report(
    1,
    "v4 array success shape parses as SUCCESS",
    r1.success && r1.messageId === "280509228",
    r1.success ? `messageId=${r1.messageId}` : `error=${(r1 as { error: string }).error}`
  );

  // Probe 2: object error shape (documented failure mode).
  const r2 = await sendSms(
    { number: "09171234567", message: "probe" },
    fetchReturning({ error: "Insufficient credits" })
  );
  report(
    2,
    "object error shape parses as FAILURE with reason",
    !r2.success && (r2 as { error: string }).error === "Insufficient credits",
    (r2 as { error: string }).error
  );

  // Probe 3: in-band HTTP 200 failure with NO error field — full body must be
  // preserved in the message so the log is diagnosable.
  const r3 = await sendSms(
    { number: "09171234567", message: "probe" },
    fetchReturning([{ some_other_problem: true }])
  );
  report(
    3,
    "HTTP 200 in-band failure keeps full body in error",
    !r3.success && (r3 as { error: string }).error.includes("some_other_problem"),
    (r3 as { error: string }).error.slice(0, 70)
  );

  // Probe 4: legacy object success shape still accepted.
  const r4 = await sendSms(
    { number: "09171234567", message: "probe" },
    fetchReturning({ message_id: "legacy-1" })
  );
  report(
    4,
    "legacy object success shape still accepted",
    r4.success && r4.messageId === "legacy-1"
  );

  if (dryRunBackup === undefined) delete process.env.SEMAPHORE_DRY_RUN;
  else process.env.SEMAPHORE_DRY_RUN = dryRunBackup;

  console.log(
    failures === 0 ? "\nAll probes passed." : `\n${failures} probe(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Probe crashed:", e);
  process.exit(1);
});
