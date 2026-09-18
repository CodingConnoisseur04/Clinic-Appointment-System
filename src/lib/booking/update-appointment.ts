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
  input: {
    appointmentId: string;
    paymentMethod: "cash" | "gcash";
    paymentReference?: string;
    paymentAmount?: number | undefined;
  }
): Promise<UpdateResult> {
  if (input.paymentAmount !== undefined &&
      (!Number.isFinite(input.paymentAmount) || input.paymentAmount < 0)) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Fee cannot be negative",
    };
  }
  return updateOne(
    supabase,
    input.appointmentId,
    {
      status: "CONFIRMED",
      payment_method: input.paymentMethod,
      payment_reference: input.paymentReference ?? null,
      payment_amount: input.paymentAmount ?? null,
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
  input: {
    appointmentId: string;
    attendance: "ATTENDED" | "NO_SHOW";
    payment?: {
      method: "cash" | "gcash";
      reference?: string;
      amount?: number | undefined;
    };
  }
): Promise<UpdateResult> {
  if (input.payment?.amount !== undefined &&
      (!Number.isFinite(input.payment.amount) || input.payment.amount < 0)) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Fee cannot be negative",
    };
  }
  return updateOne(
    supabase,
    input.appointmentId,
    {
      attendance: input.attendance,
      // Pay-after model: the fee is logged in the same motion as attendance.
      // No-shows never carry a payment — a no-show payment is a contradiction,
      // so any stray attempt to attach one is dropped, not stored.
      ...(input.attendance === "NO_SHOW"
        ? {}
        : input.payment
          ? {
              payment_method: input.payment.method,
              payment_reference: input.payment.reference ?? null,
              payment_amount: input.payment.amount ?? null,
            }
          : {}),
    },
    "CONFIRMED"
  );
}
