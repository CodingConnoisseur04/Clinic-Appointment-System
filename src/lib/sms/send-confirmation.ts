import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, type SendSmsResult } from "@/lib/sms/send-sms";
import { CLINIC } from "@/lib/brand";
import { formatTime12h } from "@/lib/utils";

export type SendConfirmationResult = {
  logged: true;
  delivered: boolean;
};

// Sends the confirmation SMS for an appointment and logs exactly one
// sms_logs row regardless of outcome — via the CALLER'S OWN session client
// (receptionist; sms_logs_insert_receptionist policy). Never throws on SMS
// failure: FR5a says log it and move on, never undo the confirmation.
export async function sendConfirmationSms(
  supabase: SupabaseClient,
  appointmentId: string,
  options?: { simulateFailure?: boolean }
): Promise<SendConfirmationResult> {
  const attempt = await (async (): Promise<{
    delivered: boolean;
    send: SendSmsResult | null;
  }> => {
    try {
      if (options?.simulateFailure) {
        return { delivered: false, send: null };
      }
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .select(
          "appointment_date, appointment_time, patients(phone)"
        )
        .eq("id", appointmentId)
        .single();
      if (apptErr || !appt) return { delivered: false, send: null };

      const phone =
        (appt.patients as unknown as { phone: string } | null)?.phone ?? null;
      if (!phone) return { delivered: false, send: null };

      const result = await sendSms({
        number: phone,
        message: `${CLINIC.name}: your appointment on ${appt.appointment_date} at ${formatTime12h(appt.appointment_time)} is CONFIRMED. See you then!`,
      });
      return { delivered: result.success, send: result };
    } catch {
      return { delivered: false, send: null };
    }
  })();
  const delivered = attempt.delivered;
  const sendResult = attempt.send;

  // provider_response records what the provider ACTUALLY said — message_id on
  // acceptance, the verbatim error otherwise — so delivery problems can be
  // diagnosed from this table without re-running the send.
  const dryRun = process.env.SEMAPHORE_DRY_RUN === "true";
  const providerResponse = delivered
    ? dryRun
      ? "dry-run success"
      : sendResult && sendResult.success
        ? `message_id=${sendResult.messageId}`
        : "accepted by provider"
    : options?.simulateFailure
      ? "simulated failure"
      : sendResult && !sendResult.success
        ? `error: ${sendResult.error}`
        : "send failed";
  if (!delivered && !options?.simulateFailure && sendResult && !sendResult.success) {
    console.error(`[sms] send failed: ${sendResult.error}`);
  }

  // Log outcome; a logging failure must not throw either, but surface via log.
  const { error: logErr } = await supabase.from("sms_logs").insert({
    appointment_id: appointmentId,
    type: "confirmation",
    status: delivered ? "sent" : "failed",
    provider_response: providerResponse,
  });
  if (logErr) {
    console.error(`[sms] failed to write sms_logs row: ${logErr.message}`);
  }

  return { logged: true, delivered };
}
