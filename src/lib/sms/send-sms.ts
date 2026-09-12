import { normalizePhMobile } from "@/lib/utils";

export type SendSmsResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

// NOTE: deliberately no `server-only` guard — the test harness imports this
// module directly. Client-bundle safety comes from architecture instead:
// SEMAPHORE_API_KEY is a non-public env var (undefined in browser bundles),
// and the only UI path to sending runs through the session-gated
// /api/sms/send-confirmation route handler.

// Sends via Semaphore (https://semaphore.co/api/v4/messages). When
// SEMAPHORE_DRY_RUN is true the HTTP call is skipped entirely — no credits
// are spent, the would-be payload is logged, and a synthetic success returns.
// `fetchImpl` is injectable so tests can prove no network call is attempted.
export async function sendSms(
  input: { number: string; message: string },
  fetchImpl: typeof fetch = fetch
): Promise<SendSmsResult> {
  const dryRun = process.env.SEMAPHORE_DRY_RUN === "true";

  if (dryRun) {
    console.log(
      `[sms:dry-run] would send to ${input.number}: ${input.message}`
    );
    return { success: true, messageId: `dry-run-${Date.now()}` };
  }

  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  if (!apiKey) {
    return { success: false, error: "SEMAPHORE_API_KEY is not set" };
  }

  // Last line of defence before the provider: canonicalize and refuse numbers
  // that cannot be a PH mobile. Storage should already hold canonical numbers
  // (find-or-create normalizes), but legacy rows or future writers may not.
  const number = normalizePhMobile(input.number);
  if (!number) {
    return {
      success: false,
      error: `invalid mobile number on record for this patient`,
    };
  }

  try {
    const body = new URLSearchParams({
      apikey: apiKey,
      number,
      message: input.message,
      ...(senderName ? { sendername: senderName } : {}),
    });

    const res = await fetchImpl("https://semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = (await res.json().catch(() => null)) as
      | { message_id?: string | number; error?: string }
      | null;

    if (!res.ok || !payload?.message_id) {
      return {
        success: false,
        error: payload?.error ?? `Semaphore returned HTTP ${res.status}`,
      };
    }
    return { success: true, messageId: String(payload.message_id) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
