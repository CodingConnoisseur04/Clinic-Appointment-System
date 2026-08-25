import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AddExceptionResult =
  | { success: true; id: string; conflictingAppointments: number }
  | { success: false; reason: string; message: string };

export type RemoveExceptionResult =
  | { success: true }
  | { success: false; reason: string; message: string };

// Insert/delete on availability_exceptions through the CALLER'S OWN
// RLS-bound client (exceptions_write_doctor is the authority). addException
// returns a non-blocking count of CONFIRMED appointments on that date so the
// UI can warn; the write proceeds regardless.
export async function addException(
  supabase: SupabaseClient,
  input: { date: string; reason?: string }
): Promise<AddExceptionResult> {
  if (!z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(input.date).success) {
    return {
      success: false,
      reason: "VALIDATION_ERROR",
      message: "Date must be YYYY-MM-DD",
    };
  }

  // Conflict count BEFORE insert (the closure itself doesn't affect it).
  const { count } = await supabase
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("status", "CONFIRMED")
    .eq("appointment_date", input.date);

  const { data, error } = await supabase
    .from("availability_exceptions")
    .insert({ exception_date: input.date, reason: input.reason ?? null })
    .select("id")
    .single();

  if (error) {
    if (
      error.code === "23505" ||
      error.message.includes("availability_exceptions_exception_date_key")
    ) {
      return {
        success: false,
        reason: "ALREADY_CLOSED",
        message: `${input.date} is already marked closed`,
      };
    }
    return { success: false, reason: "DB_ERROR", message: error.message };
  }
  return {
    success: true,
    id: data.id,
    conflictingAppointments: count ?? 0,
  };
}

export async function removeException(
  supabase: SupabaseClient,
  input: { id: string }
): Promise<RemoveExceptionResult> {
  if (!z.string().uuid().safeParse(input.id).success) {
    return { success: false, reason: "VALIDATION_ERROR", message: "Invalid id" };
  }

  const { data, error } = await supabase
    .from("availability_exceptions")
    .delete()
    .eq("id", input.id)
    .select("id");

  if (error) {
    return { success: false, reason: "DB_ERROR", message: error.message };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message: "No matching removable exception (not found or denied by RLS)",
    };
  }
  return { success: true };
}
