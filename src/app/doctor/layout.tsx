import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardHeader } from "@/components/dashboard-header";

export default async function DoctorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireRole(["doctor"]);
  return (
    <div className="flex min-h-dvh flex-col">
      <DashboardHeader name={profile.full_name} role={profile.role} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
