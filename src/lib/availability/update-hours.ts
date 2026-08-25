import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateHoursResult =
  | { success: true; conflictingAppointments: number }
  | { success: false; reason: string; message: string };

const inputSchema = z.object({
  id: z.string().uuid(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  isActive: z.boolean(),
});

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Updates one doctor_availability row through the CALLER'S OWN RLS-bound
// client — no in-function role check (availability_write_doctor is the
// authority). Returns a non-blocking count of CONFIRMED appointments on that
// weekday whose time now falls outside the active window, so the UI can warn
// without preventing the save.
export async function updateWorkingHours(
  supabase: SupabaseClient,
  input: {
    id: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }
): Promise<UpdateHoursResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: parsed.error.issues[0].message,
    };
  }
  if (
    input.isActive &&
    toMinutes(input.startTime) >= toMinutes(input.endTime)
  ) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Start time must be before end time",
    };
  }

  // Fetch the row first for its day_of_week (needed for the conflict count).
  const { data: row } = await supabase
    .from("doctor_availability")
    .select("day_of_week")
    .eq("id", input.id)
    .single();
  if (!row) {
    return { success: false, reason: "NOT_FOUND", message: "Availability row not found" };
  }

  let conflictingAppointments = 0;
  if (input.isActive) {
    // Confirmed appointments matching this weekday whose time falls outside
    // the new window are the ones the change strands.
    const { data: appts } = await supabase
      .from("appointments")
      .select("appointment_date, appointment_time")
      .eq("status", "CONFIRMED");
    conflictingAppointments = (appts ?? []).filter((a) => {
      const dow = new Date(`${a.appointment_date}T00:00:00Z`).getUTCDay();
      if (dow !== row.day_of_week) return false;
      const t = toMinutes(a.appointment_time.slice(0, 5));
      return (
        t < toMinutes(input.startTime) || t + 30 > toMinutes(input.endTime)
      );
    }).length;
  }

  const { data, error } = await supabase
    .from("doctor_availability")
    .update({
      start_time: input.startTime,
      end_time: input.endTime,
      is_active: input.isActive,
    })
    .eq("id", input.id)
    .select("id");

  if (error) {
    return { success: false, reason: "DB_ERROR", message: error.message };
  }
  // Zero rows = not found OR denied by RLS (e.g. non-doctor session) —
  // supabase-js reports neither case as an error, so check explicitly.
  if (!data || data.length === 0) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message: "No matching updatable row (not found or denied by RLS)",
    };
  }
  return { success: true, conflictingAppointments };
}
