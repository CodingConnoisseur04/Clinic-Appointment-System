import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayIso } from "@/lib/utils";

export type RescheduleResult =
  | { success: true; previousDate: string; previousTime: string }
  | {
      success: false;
      reason:
        | "NOT_FOUND_OR_DENIED"
        | "ALREADY_CANCELLED"
        | "PAST_APPOINTMENT"
        | "SAME_SLOT"
        | "SLOT_TAKEN"
        | "CLOSED_DATE"
        | "VALIDATION_ERROR";
      message: string;
    };

const inputSchema = z.object({
  appointmentId: z.string().uuid(),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  newTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

// Moves an appointment to a new date and time, in place — cancellation is a
// status and history is never rewritten, so a move keeps the same row (and
// its payment record) and only changes when it is for.
//
// Runs through the CALLER'S OWN RLS-bound client with no in-function role
// checks, mirroring update-appointment.ts: the appointments_update_staff
// policy is the authority. A patient session can read its own row here, but
// the UPDATE itself matches zero rows under RLS and surfaces as
// NOT_FOUND_OR_DENIED — no patient-reachable write exists.
//
// The DB-level uq_appointments_slot index (partial: status <> 'CANCELLED') is
// the concurrency backstop; this function translates its unique-violation
// into a typed SLOT_TAKEN outcome. The moving row itself is in that index, so
// a target occupied by any other live appointment (or kept identical) is
// refused before the desk can silently double-book.
export async function rescheduleAppointment(
  supabase: SupabaseClient,
  input: { appointmentId: string; newDate: string; newTime: string }
): Promise<RescheduleResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { data: row, error: readErr } = await supabase
    .from("appointments")
    .select("status, appointment_date, appointment_time")
    .eq("id", input.appointmentId)
    .maybeSingle();
  if (readErr) {
    return { success: false, reason: "VALIDATION_ERROR", message: readErr.message };
  }
  if (!row) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message: "No matching appointment (not found, or denied by RLS)",
    };
  }

  // Postgres `time` comes back as "HH:MM:SS"; normalize for comparisons and
  // for the previousTime we hand back to the UI.
  const currentTime = (row.appointment_time as string).slice(0, 5);

  if (row.status === "CANCELLED") {
    return {
      success: false,
      reason: "ALREADY_CANCELLED",
      message: "This appointment is cancelled. Book a new one instead of moving it.",
    };
  }
  // "Past" means it already started: any earlier date, or today with the
  // start time reached. Today's remaining appointments stay movable — the
  // desk moves them exactly like future ones (human decision 2026-09-12).
  const today = todayIso();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = currentTime.split(":").map(Number);
  const alreadyStarted =
    (row.appointment_date as string) < today ||
    ((row.appointment_date as string) === today && startH * 60 + startM <= nowMinutes);
  if (alreadyStarted) {
    return {
      success: false,
      reason: "PAST_APPOINTMENT",
      message:
        "This appointment's time has already passed. Mark attendance or cancel instead of moving it.",
    };
  }
  if (row.appointment_date === input.newDate && currentTime === input.newTime) {
    return {
      success: false,
      reason: "SAME_SLOT",
      message: "That is already the booked time. Pick a different slot.",
    };
  }

  // A move into a time that has already passed is always a mistake. The slot
  // picker filters these out client-side; this is defence in depth for direct
  // API use, consistent with the "nothing starts in the past" rule the rest
  // of the booking surface follows.
  if (input.newDate === today) {
    const [newH, newM] = input.newTime.split(":").map(Number);
    if (newH * 60 + newM <= nowMinutes) {
      return {
        success: false,
        reason: "VALIDATION_ERROR",
        message: "That time today has already passed. Pick a time still ahead.",
      };
    }
  }

  // Closed-date pre-check before the write. Same documented caveat as
  // create-appointment: closure has no index backstop, so this is racy under
  // concurrent edits — acceptable at this clinic's scale.
  const closed = await supabase
    .from("availability_exceptions")
    .select("id")
    .eq("exception_date", input.newDate)
    .maybeSingle();
  if (closed.data) {
    return {
      success: false,
      reason: "CLOSED_DATE",
      message: `Clinic is closed on ${input.newDate}`,
    };
  }

  // Scope to the starting status: if the appointment is cancelled between the
  // read above and this write, the update matches zero rows instead of
  // resurrecting a cancelled record.
  const { data: updated, error } = await supabase
    .from("appointments")
    .update({ appointment_date: input.newDate, appointment_time: input.newTime })
    .eq("id", input.appointmentId)
    .eq("status", row.status)
    .select("id");

  if (!error && updated && updated.length > 0) {
    return { success: true, previousDate: row.appointment_date, previousTime: currentTime };
  }

  if (
    error &&
    (error.code === "23505" ||
      (error as { details?: string }).details?.includes("uq_appointments_slot") ||
      error.message.includes("uq_appointments_slot"))
  ) {
    return {
      success: false,
      reason: "SLOT_TAKEN",
      message: "That slot is no longer available",
    };
  }

  if (!error) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message:
        "No matching updatable appointment (state changed since it was read, or denied by RLS)",
    };
  }

  return { success: false, reason: "VALIDATION_ERROR", message: error.message };
}
