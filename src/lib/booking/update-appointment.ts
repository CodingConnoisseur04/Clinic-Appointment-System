import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdateResult =
  | { success: true }
  | {
      success: false;
      reason: "NOT_FOUND_OR_DENIED" | "VALIDATION_ERROR";
      message: string;
    };

const idSchema = z.string().uuid();

// All three functions run through the CALLER'S OWN RLS-bound client and
// contain no role checks by design — Phase 2's appointments_update_staff
// policy is the authority; a patient session's update matches zero rows
// (RLS filters them out), which surfaces here as NOT_FOUND_OR_DENIED.

async function updateOne(
  supabase: SupabaseClient,
  appointmentId: string,
  fields: Record<string, unknown>,
  scopeStatus?: "PENDING" | "CONFIRMED"
): Promise<UpdateResult> {
  if (!idSchema.safeParse(appointmentId).success) {
    return { success: false, reason: "VALIDATION_ERROR", message: "Invalid appointment id" };
  }

  let query = supabase.from("appointments").update(fields).eq("id", appointmentId);
  if (scopeStatus) query = query.eq("status", scopeStatus);

  const { data, error } = await query.select("id");

  if (error) {
    return { success: false, reason: "VALIDATION_ERROR", message: error.message };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message: "No matching updatable appointment (not found, wrong state, or denied by RLS)",
    };
  }
  return { success: true };
}

export async function confirmAppointment(
  supabase: SupabaseClient,
  input: { appointmentId: string; paymentMethod: "cash" | "gcash"; paymentReference?: string }
): Promise<UpdateResult> {
  return updateOne(
    supabase,
    input.appointmentId,
    {
      status: "CONFIRMED",
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference ?? null,
    },
    "PENDING"
  );
}

export async function rejectAppointment(
  supabase: SupabaseClient,
  input: { appointmentId: string }
): Promise<UpdateResult> {
  return updateOne(supabase, input.appointmentId, {
    status: "CANCELLED",
  });
}

export async function markAttendance(
  supabase: SupabaseClient,
  input: { appointmentId: string; attendance: "ATTENDED" | "NO_SHOW" }
): Promise<UpdateResult> {
  return updateOne(
    supabase,
    input.appointmentId,
    { attendance: input.attendance },
    "CONFIRMED"
  );
}
