import type { SupabaseClient } from "@supabase/supabase-js";

export type Slot = { time: string }; // "HH:MM", 24hr

function toHHMM(time: string): string {
  // Postgres `time` comes back as "HH:MM:SS"; normalize to "HH:MM".
  return time.slice(0, 5);
}

function generateSlots(
  start: string,
  end: string,
  durationMinutes: number
): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  const slots: string[] = [];
  for (let t = startMin; t + durationMinutes <= endMin; t += durationMinutes) {
    slots.push(
      `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
    );
  }
  return slots;
}

// Computes bookable slots for a date: closed-day short-circuit, weekly hours,
// minus non-cancelled bookings. MUST run with a client that can see ALL
// appointments for the date (service-role via /api/available-slots) — a
// patient-scoped session only sees its own rows and would under-count.
export async function getAvailableSlots(
  supabase: SupabaseClient,
  date: string
): Promise<Slot[]> {
  const closed = await supabase
    .from("availability_exceptions")
    .select("id")
    .eq("exception_date", date)
    .maybeSingle();
  if (closed.data) return [];

  const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();

  const { data: hours, error } = await supabase
    .from("doctor_availability")
    .select("start_time, end_time, slot_duration_minutes")
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true);
  if (error || !hours || hours.length === 0) return [];

  const { data: booked, error: bookedError } = await supabase
    .from("appointments")
    .select("appointment_time")
    .eq("appointment_date", date)
    .neq("status", "CANCELLED");
  if (bookedError) return [];

  const takenTimes = new Set((booked ?? []).map((b) => toHHMM(b.appointment_time)));

  const candidates = hours.flatMap((h) =>
    generateSlots(h.start_time, h.end_time, h.slot_duration_minutes)
  );

  return [...new Set(candidates)]
    .filter((time) => !takenTimes.has(time))
    .sort()
    .map((time) => ({ time }));
}
