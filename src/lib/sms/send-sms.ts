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
    // Semaphore v4 returns a JSON ARRAY (one element per recipient) on
    // success: [{ message_id, status: "Pending", ... }]. Errors come back as
    // an object with an `error` field. Accept both shapes — checking only the
    // object shape classified real, delivered sends as failures.
    const payload = (await res.json().catch(() => null)) as
      | { message_id?: string | number; error?: string }
      | { message_id?: string | number; error?: string }[]
      | null;
    const first = Array.isArray(payload) ? payload[0] : payload;

    if (!res.ok || !first?.message_id) {
      // Semaphore reports in-band failures inside HTTP 200 (e.g. credit
      // problems) in shapes other than {error} — so the fallback includes the
      // FULL response body. A log line that says only "HTTP 200" is useless
      // for diagnosing why the patient got no text.
      return {
        success: false,
        error: first?.error
          ?? `Semaphore rejected send (HTTP ${res.status}): ${JSON.stringify(payload)}`,
      };
    }
    return { success: true, messageId: String(first.message_id) };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
