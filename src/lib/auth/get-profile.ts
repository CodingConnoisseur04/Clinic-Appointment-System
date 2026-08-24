import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  role: "patient" | "doctor" | "receptionist";
  full_name: string;
  phone: string | null;
};

// Server-side only. Returns the signed-in user's profile row, or null when
// unauthenticated / no profile exists yet.
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (!data) return null;

  return data as CurrentProfile;
}
