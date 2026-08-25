import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SmsReport = {
  confirmationSent: number;
  confirmationFailed: number;
  reminderSent: number;
  reminderFailed: number;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// SMS delivery counts grouped by type and status. Receptionist-only reads via
// sms_logs_select_receptionist; any other role's session sees all zeros (RLS
// scopes, it doesn't error).
export async function getSmsReport(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<SmsReport> {
  const empty = {
    confirmationSent: 0,
    confirmationFailed: 0,
    reminderSent: 0,
    reminderFailed: 0,
  };
  if (!rangeSchema.safeParse(range).success) return empty;

  const { data, error } = await supabase
    .from("sms_logs")
    .select("type, status")
    .gte("sent_at", `${range.from}T00:00:00Z`)
    .lte("sent_at", `${range.to}T23:59:59Z`);
  if (error || !data) return empty;

  const report = { ...empty };
  for (const row of data as { type: string; status: string }[]) {
    if (row.type === "confirmation") {
      if (row.status === "sent") report.confirmationSent++;
      else report.confirmationFailed++;
    } else if (row.type === "reminder") {
      if (row.status === "sent") report.reminderSent++;
      else report.reminderFailed++;
    }
  }
  return report;
}
