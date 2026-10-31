import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/send-sms";
import { formatTime12h } from "@/lib/utils";

export const dynamic = "force-dynamic";

// System-triggered reminder sender — no user session exists, so admin.ts is
// the correct (and only applicable) tool here, not a workaround. Gated by
// CRON_SECRET: an open route here could spend real money. Scheduling is
// Phase 9's job; locally trigger manually with the right header.

// Reminders target appointments ~24h out: anything whose scheduled start
// falls within ±12 hours of now+24h.
function reminderWindow(): { startMs: number; endMs: number } {
  const target = Date.now() + 24 * 60 * 60 * 1000;
  return { startMs: target - 12 * 60 * 60 * 1000, endMs: target + 12 * 60 * 60 * 1000 };
}

// Stored dates/times are the CLINIC's wall clock (Asia/Manila, a fixed UTC+8
// with no DST). Hosted serverless runtimes run in UTC, so the offset is applied
// explicitly instead of relying on the host's local zone — otherwise the
// reminder window shifts 8 hours and afternoon appointments get skipped.
const CLINIC_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function appointmentMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - CLINIC_UTC_OFFSET_MS;
}

// Format an instant as a clinic-local YYYY-MM-DD (server-zone independent).
function clinicDateString(ms: number): string {
  const d = new Date(ms + CLINIC_UTC_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Widen the SQL query to the full possible calendar-day span of the window,
  // then filter precisely on date+time in JS.
  const window = reminderWindow();
  const dayMs = 24 * 60 * 60 * 1000;
  const fromDate = clinicDateString(window.startMs - dayMs);
  const toDate = clinicDateString(window.endMs + dayMs);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, appointment_time, patients(phone), sms_logs(type, status)"
    )
    .eq("status", "CONFIRMED")
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const appt of appts ?? []) {
    const t = appointmentMs(appt.appointment_date, appt.appointment_time);
    if (t < window.startMs || t > window.endMs) continue;

    // Dedup: skip appointments that already have a sent reminder. Without
    // this, running the cron twice in the window texts (and charges for)
    // every confirmed appointment twice. Failed reminders are retried.
    const reminders =
      (appt.sms_logs as unknown as { type: string; status: string }[] | null) ??
      [];
    if (reminders.some((l) => l.type === "reminder" && l.status === "sent")) {
      continue;
    }

    const phone = (appt.patients as unknown as { phone: string } | null)?.phone;
    if (!phone) {
      failed++;
      await supabase.from("sms_logs").insert({
        appointment_id: appt.id,
        type: "reminder",
        status: "failed",
        provider_response: "no patient phone on record",
      });
      continue;
    }

    const result = await sendSms({
      number: phone,
      message: `Clinic reminder: you have an appointment on ${appt.appointment_date} at ${formatTime12h(appt.appointment_time)}.`,
    });

    await supabase.from("sms_logs").insert({
      appointment_id: appt.id,
      type: "reminder",
      status: result.success ? "sent" : "failed",
      provider_response: result.success
        ? process.env.SEMAPHORE_DRY_RUN === "true"
          ? "dry-run success"
          : `message_id=${result.messageId}`
        : result.error,
    });

    if (result.success) sent++;
    else failed++;
  }

  return Response.json({ matched: appts?.length ?? 0, sent, failed });
}
