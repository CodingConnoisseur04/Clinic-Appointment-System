import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AppointmentSummary = {
  pending: number;
  confirmed: number;
  cancelled: number;
  online: number;
  walkIn: number;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Volume/mix view: appointments CREATED within the range (created_at), counted
// separately by current status and by source. Caller's RLS session applies —
// receptionist sees everything; other roles see their own scoped subset.
export async function getAppointmentSummary(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<AppointmentSummary> {
  const empty = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    online: 0,
    walkIn: 0,
  };
  if (!rangeSchema.safeParse(range).success) return empty;

  const { data, error } = await supabase
    .from("appointments")
    .select("status, source, created_at")
    .gte("created_at", `${range.from}T00:00:00Z`)
    .lte("created_at", `${range.to}T23:59:59Z`);
  if (error || !data) return empty;

  const summary = { ...empty };
  for (const row of data as {
    status: string;
    source: string;
  }[]) {
    if (row.status === "PENDING") summary.pending++;
    else if (row.status === "CONFIRMED") summary.confirmed++;
    else if (row.status === "CANCELLED") summary.cancelled++;
    if (row.source === "online") summary.online++;
    else summary.walkIn++;
  }
  return summary;
}
