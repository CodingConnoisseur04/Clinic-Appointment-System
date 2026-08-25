import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NoShowReport = {
  attended: number;
  noShowMarked: number;
  noShowInferred: number;
  noShowRatePercent: number;
  totalPastConfirmed: number;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// No-show rate over past CONFIRMED appointments in range. Addendum A.5
// resolution (b): a past CONFIRMED row with attendance still NULL counts as
// NO_SHOW FOR THIS REPORT ONLY — computed at query time in this module,
// NEVER written back to the attendance column. This function is read-only.
export async function getNoShowReport(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<NoShowReport> {
  const empty = {
    attended: 0,
    noShowMarked: 0,
    noShowInferred: 0,
    noShowRatePercent: 0,
    totalPastConfirmed: 0,
  };
  if (!rangeSchema.safeParse(range).success) return empty;

  const today = todayStr();
  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date, attendance")
    .eq("status", "CONFIRMED")
    .gte("appointment_date", range.from)
    .lte("appointment_date", range.to)
    .lte("appointment_date", today);
  if (error || !data) return empty;

  const report = { ...empty };
  report.totalPastConfirmed = data.length;
  for (const row of data as {
    attendance: "ATTENDED" | "NO_SHOW" | null;
  }[]) {
    if (row.attendance === "ATTENDED") report.attended++;
    else if (row.attendance === "NO_SHOW") report.noShowMarked++;
    else report.noShowInferred++;
  }
  const totalNoShow = report.noShowMarked + report.noShowInferred;
  report.noShowRatePercent =
    report.totalPastConfirmed === 0
      ? 0
      : Math.round((totalNoShow / report.totalPastConfirmed) * 100);
  return report;
}
