import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/send-sms";

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

function appointmentMs(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // Local server time is the clinic's frame of reference.
  return new Date(y, mo - 1, d, h, mi).getTime();
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
  const fromDate = new Date(window.startMs - dayMs);
  const toDate = new Date(window.endMs + dayMs);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, appointment_date, appointment_time, patients(phone)")
    .eq("status", "CONFIRMED")
    .gte("appointment_date", fmt(fromDate))
    .lte("appointment_date", fmt(toDate));

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const appt of appts ?? []) {
    const t = appointmentMs(appt.appointment_date, appt.appointment_time);
    if (t < window.startMs || t > window.endMs) continue;

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
      message: `Clinic reminder: you have an appointment on ${appt.appointment_date} at ${appt.appointment_time.slice(0, 5)}.`,
    });

    await supabase.from("sms_logs").insert({
      appointment_id: appt.id,
      type: "reminder",
      status: result.success ? "sent" : "failed",
      provider_response: result.success
        ? process.env.SEMAPHORE_DRY_RUN === "true"
          ? "dry-run success"
          : "accepted by provider"
        : result.error,
    });

    if (result.success) sent++;
    else failed++;
  }

  return Response.json({ matched: appts?.length ?? 0, sent, failed });
}
