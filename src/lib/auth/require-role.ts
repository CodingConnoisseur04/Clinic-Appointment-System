import { redirect } from "next/navigation";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth/get-profile";

export type UserRole = CurrentProfile["role"];

const ROLE_HOME: Record<UserRole, string> = {
  patient: "/patient",
  doctor: "/doctor",
  receptionist: "/receptionist",
};

// UX-layer gate for protected pages. RLS remains the actual authority
// underneath; this exists so the wrong role gets redirected somewhere
// sensible instead of shown raw errors.
export async function requireRole(allowed: UserRole[]): Promise<CurrentProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!allowed.includes(profile.role)) redirect(ROLE_HOME[profile.role]);
  return profile;
}
