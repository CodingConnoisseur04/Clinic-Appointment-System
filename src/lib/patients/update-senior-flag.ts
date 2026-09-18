import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SeniorFlagResult =
  | { success: true }
  | { success: false; reason: "NOT_FOUND_OR_DENIED" | "VALIDATION_ERROR"; message: string };

const idSchema = z.string().uuid();

/**
 * Toggles the senior/PWD flag on a patients row through the CALLER'S OWN
 * RLS-bound client. A receptionist session is the intended caller
 * (patients_update_staff); a patient session may flip their OWN flag
 * (patients_update_own — self-assertion, verified at the desk when money
 * changes hands). Anyone else's update matches zero rows and surfaces as
 * NOT_FOUND_OR_DENIED, same contract as the booking update helpers.
 */
export async function setPatientSeniorPwd(
  supabase: SupabaseClient,
  patientId: string,
  value: boolean
): Promise<SeniorFlagResult> {
  if (!idSchema.safeParse(patientId).success) {
    return { success: false, reason: "VALIDATION_ERROR", message: "Invalid patient id" };
  }

  const { data, error } = await supabase
    .from("patients")
    .update({ is_senior_pwd: value })
    .eq("id", patientId)
    .select("id");

  if (error) {
    return { success: false, reason: "VALIDATION_ERROR", message: error.message };
  }
  if (!data || data.length === 0) {
    return {
      success: false,
      reason: "NOT_FOUND_OR_DENIED",
      message: "No matching updatable patient (not found or denied by RLS)",
    };
  }
  return { success: true };
}
