import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/require-role";
import { DashboardHeader } from "@/components/dashboard-header";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { RoleSidebar } from "@/components/nav/sidebar-nav";

export default async function PatientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireRole(["patient"]);
  return (
    <SidebarProvider>
      <RoleSidebar role="patient" />
      <SidebarInset>
        <DashboardHeader name={profile.full_name} role={profile.role} />
        <div className="page-enter flex flex-1 flex-col p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
