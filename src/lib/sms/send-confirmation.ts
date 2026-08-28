import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/sms/send-sms";
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
  const delivered = await (async () => {
    try {
      if (options?.simulateFailure) {
        return false;
      }
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .select(
          "appointment_date, appointment_time, patients(phone)"
        )
        .eq("id", appointmentId)
        .single();
      if (apptErr || !appt) return false;

      const phone =
        (appt.patients as unknown as { phone: string } | null)?.phone ?? null;
      if (!phone) return false;

      const result = await sendSms({
        number: phone,
        message: `${CLINIC.name}: your appointment on ${appt.appointment_date} at ${formatTime12h(appt.appointment_time)} is CONFIRMED. See you then!`,
      });
      return result.success;
    } catch {
      return false;
    }
  })();

  // Log outcome; a logging failure must not throw either, but surface via log.
  const { error: logErr } = await supabase.from("sms_logs").insert({
    appointment_id: appointmentId,
    type: "confirmation",
    status: delivered ? "sent" : "failed",
    provider_response: delivered
      ? process.env.SEMAPHORE_DRY_RUN === "true"
        ? "dry-run success"
        : "accepted by provider"
      : options?.simulateFailure
        ? "simulated failure"
        : "send failed",
  });
  if (logErr) {
    console.error(`[sms] failed to write sms_logs row: ${logErr.message}`);
  }

  return { logged: true, delivered };
}
