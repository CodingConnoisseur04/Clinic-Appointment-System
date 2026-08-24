import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateAppointmentInput = {
  patientId: string;
  appointmentDate: string;
  appointmentTime: string;
  reason?: string;
  source: "online" | "walk_in";
  handledBy?: string; // receptionist profile id, required for walk_in
};

export type CreateAppointmentResult =
  | { success: true; appointmentId: string }
  | {
      success: false;
      reason: "SLOT_TAKEN" | "CLOSED_DATE" | "VALIDATION_ERROR";
      message: string;
    };

const inputSchema = z.object({
  patientId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: z.string().optional(),
  source: z.enum(["online", "walk_in"]),
  handledBy: z.string().uuid().optional(),
});

// Creates an appointment through the CALLER'S OWN RLS-bound client — never
// the service-role client. A patient session can only insert their own
// PENDING/online request (appointments_insert_own); a receptionist session
// has full write (appointments_insert_staff). The DB-level
// uq_appointments_slot constraint is the concurrency backstop; this function
// translates its unique-violation into a typed SLOT_TAKEN outcome.
export async function createAppointment(
  supabase: SupabaseClient,
  input: CreateAppointmentInput
): Promise<CreateAppointmentResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  if (input.source === "walk_in" && !input.handledBy) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: "handledBy is required for walk_in appointments",
    };
  }

  const closed = await supabase
    .from("availability_exceptions")
    .select("id")
    .eq("exception_date", input.appointmentDate)
    .maybeSingle();
  if (closed.data) {
    return {
      success: false,
      reason: "CLOSED_DATE",
      message: `Clinic is closed on ${input.appointmentDate}`,
    };
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: input.patientId,
      appointment_date: input.appointmentDate,
      appointment_time: input.appointmentTime,
      reason: input.reason ?? null,
      source: input.source,
      status: "PENDING",
      handled_by: input.handledBy ?? null,
    })
    .select("id")
    .single();

  if (!error && data) {
    return { success: true, appointmentId: data.id };
  }

  if (
    error &&
    (error.code === "23505" ||
      (error as { details?: string }).details?.includes(
        "uq_appointments_slot"
      ) ||
      error.message.includes("uq_appointments_slot"))
  ) {
    return {
      success: false,
      reason: "SLOT_TAKEN",
      message: "That slot is no longer available",
    };
  }

  return {
    success: false,
    reason: "VALIDATION_ERROR",
    message: error?.message ?? "Unknown database error",
  };
}
