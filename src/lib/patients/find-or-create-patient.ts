import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhMobile } from "@/lib/utils";

export type FindOrCreatePatientInput = {
  phone: string;
  fullName: string;
  profileId?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  // Senior/PWD self-assertion (signup) or desk entry (walk-in). Only applied
  // on CREATE — an existing record's flag is never overwritten here; the desk
  // toggles that explicitly.
  isSeniorPwd?: boolean;
};

const inputSchema = z.object({
  phone: z.string().min(1),
  fullName: z.string().min(1),
  profileId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  address: z.string().optional(),
});

// Reconciles patient identity by exact phone match (Addendum A.1): reuse an
// existing walk-in record rather than creating a duplicate, linking
// profile_id when the caller is a registered account. MUST run with the
// service-role client — a not-yet-linked patient has no patients row their
// session can see, so a phone-based lookup is structurally impossible under
// RLS as designed (the one deliberate exception to caller-session writes).
export async function findOrCreatePatient(
  supabase: SupabaseClient,
  input: FindOrCreatePatientInput
): Promise<{ patientId: string; wasExisting: boolean } | { error: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  // Canonicalize before BOTH the lookup and the insert: exact-match
  // reconciliation only works if every entry of the same number produces the
  // same stored string ("0917 123 4567" and "+639171234567" are one patient).
  const phone = normalizePhMobile(input.phone);
  if (!phone) {
    return { error: "Please enter a valid PH mobile number, e.g. 0917 123 4567" };
  }

  const { data: existing } = await supabase
    .from("patients")
    .select("id, profile_id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.profile_id === null && input.profileId) {
      // Walk-in now registering online: link the profile. Fails with 23505
      // if that profile is already linked to another row; in that case
      // return the already-linked row instead of duplicating.
      const update = await supabase
        .from("patients")
        .update({
          profile_id: input.profileId,
          full_name: input.fullName,
          ...(input.email ? { email: input.email } : {}),
          ...(input.dateOfBirth ? { date_of_birth: input.dateOfBirth } : {}),
          ...(input.address ? { address: input.address } : {}),
        })
        .eq("id", existing.id)
        .select("id")
        .single();

      if (!update.error && update.data) {
        return { patientId: update.data.id, wasExisting: true };
      }

      if (update.error.code === "23505") {
        const linked = await supabase
          .from("patients")
          .select("id")
          .eq("profile_id", input.profileId)
          .limit(1)
          .maybeSingle();
        if (linked.data) {
          return { patientId: linked.data.id, wasExisting: true };
        }
      }
      return { error: update.error?.message ?? "Failed to link patient" };
    }

    return { patientId: existing.id, wasExisting: true };
  }

  const insert = await supabase
    .from("patients")
    .insert({
      phone,
      full_name: input.fullName,
      profile_id: input.profileId ?? null,
      email: input.email ?? null,
      date_of_birth: input.dateOfBirth ?? null,
      address: input.address ?? null,
      is_senior_pwd: input.isSeniorPwd === true,
    })
    .select("id")
    .single();

  if (insert.error || !insert.data) {
    return { error: insert.error?.message ?? "Failed to create patient" };
  }
  return { patientId: insert.data.id, wasExisting: false };
}
