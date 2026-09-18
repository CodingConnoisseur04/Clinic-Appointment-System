import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScheduleEntry = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  reason: string | null;
  patients: { full_name: string; phone: string; is_senior_pwd: boolean | null } | null;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Confirmed appointments in a date range, joined to patient info. Runs
// through the CALLER'S OWN RLS-bound client — the doctor's
// appointments_select_doctor policy (CONFIRMED-only, all patients) makes a
// service-role route unnecessary, unlike Phase 3's cross-patient slot reads.
// A receptionist session returns everything (by design); a patient session
// only ever sees their own rows.
export async function getSchedule(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<ScheduleEntry[]> {
  if (!rangeSchema.safeParse(range).success) return [];

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, appointment_time, reason, patients(full_name, phone, is_senior_pwd)"
    )
    .gte("appointment_date", range.from)
    .lte("appointment_date", range.to)
    .order("appointment_date")
    .order("appointment_time");

  if (error) return [];
  return (data ?? []) as unknown as ScheduleEntry[];
}
