import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms, type SendSmsResult } from "@/lib/sms/send-sms";
import { CLINIC } from "@/lib/brand";
import { getClinicSettings } from "@/lib/clinic-settings";
import { formatTime12h } from "@/lib/utils";

export type SendConfirmationResult = {
  // True only when the sms_logs row was actually written — a false here means
  // the outcome exists nowhere durable, so callers should treat the send as
  // unrecorded (the UI surfaces this; Phase 7's FR5a spirit is honesty, not
  // optimistic reporting).
  logged: boolean;
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
          "appointment_date, appointment_time, payment_amount, discount_amount, patients(phone, is_senior_pwd)"
        )
        .eq("id", appointmentId)
        .single();
      if (apptErr || !appt) return { delivered: false, send: null };

      const phone =
        (appt.patients as unknown as { phone: string } | null)?.phone ?? null;
      if (!phone) return { delivered: false, send: null };

      // The fee line tells the remote patient exactly what to bring or send —
      // honest about payment status, since the record knows the difference.
      // No fee logged yet → quote the Settings default (the desk may log a
      // different amount later, e.g. a senior discount — the SMS says so).
      // SMS best practice: ASCII-safe peso amounts. The ₱ glyph is outside
      // the GSM-7 charset — it forces UCS-2, tripling the message to 3
      // segments/credits (and it garbles on some handsets). "PHP 500" sends
      // as one segment.
      const patient = appt.patients as unknown as
        | { phone: string; is_senior_pwd: boolean | null }
        | null;
      const seniorPct =
        patient?.is_senior_pwd === true
          ? Number((await getClinicSettings(supabase)).senior_discount_percent ?? "") || 0
          : 0;

      let feeLine = "";
      if (appt.payment_amount !== null && appt.payment_amount !== undefined) {
        const amount = Number(appt.payment_amount).toLocaleString("en-PH", { maximumFractionDigits: 2 });
        // When a discount was given, say so: the patient should not have to
        // guess why the number is lower than the usual fee.
        feeLine = seniorPct > 0
          ? ` PHP ${amount} (after ${seniorPct}% senior/PWD discount) fee received -`
          : ` PHP ${amount} fee received -`;
      } else {
        const settings = await getClinicSettings(supabase);
        if (settings.consultation_fee) {
          const fee = Number(settings.consultation_fee).toLocaleString("en-PH", { maximumFractionDigits: 2 });
          // No fee logged yet: quote the NORMAL fee, plus the discount notice
          // when the patient is flagged — the desk applies it when payment is
          // arranged, so the patient knows to expect less than this figure.
          feeLine = seniorPct > 0
            ? ` Consultation fee: PHP ${fee} - ${seniorPct}% senior/PWD discount applies (pay at the clinic).`
            : ` Consultation fee: PHP ${fee} (pay at the clinic).`;
        }
      }

      const result = await sendSms({
        number: phone,
        message: `${CLINIC.name}: your appointment on ${appt.appointment_date} at ${formatTime12h(appt.appointment_time)} is CONFIRMED.${feeLine} See you then!`,
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

  return { logged: !logErr, delivered };
}
