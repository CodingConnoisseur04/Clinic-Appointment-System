import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PeakHoursReport = {
  // One entry per clinic time slot seen in the range ("09:00" ... "16:30"),
  // ordered by time. Counted from appointment_time — when the clinic was
  // ASKED to be busy, not when the record was created.
  slots: { time: string; count: number }[];
  // The busiest slot, or null when nothing is booked in the range.
  peakTime: string | null;
  peakCount: number;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function empty(): PeakHoursReport {
  return { slots: [], peakTime: null, peakCount: 0 };
}

// Peak hours: every non-cancelled appointment DATED within the range,
// bucketed by its time-of-day slot. Cancelled requests are excluded — a
// cancelled booking is a slot that freed up; counting it would invent
// demand that never reached the chair. Caller's RLS session applies,
// consistent with the other report functions.
export async function getPeakHours(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<PeakHoursReport> {
  if (!rangeSchema.safeParse(range).success) return empty();

  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_time, status")
    .gte("appointment_date", range.from)
    .lte("appointment_date", range.to)
    .neq("status", "CANCELLED");

  if (error || !data) return empty();

  const counts = new Map<string, number>();
  for (const row of data as { appointment_time: string }[]) {
    // appointment_time arrives as "HH:MM" (or "HH:MM:SS" via some drivers);
    // normalize to HH:MM so equal slots bucket together.
    const time = row.appointment_time.slice(0, 5);
    counts.set(time, (counts.get(time) ?? 0) + 1);
  }

  const slots = [...counts.entries()]
    .map(([time, count]) => ({ time, count }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const peak = slots.reduce<{ time: string | null; count: number }>(
    (best, s) => (s.count > best.count ? { time: s.time, count: s.count } : best),
    { time: null, count: 0 }
  );

  return { slots, peakTime: peak.time, peakCount: peak.count };
}
