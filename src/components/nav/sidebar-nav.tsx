"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  UserPlus,
  Stethoscope,
  Clock,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CLINIC } from "@/lib/brand";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const RECEPTIONIST_NAV: NavItem[] = [
  { label: "Home", href: "/receptionist", icon: Home },
  { label: "Pending Requests", href: "/receptionist/pending", icon: ClipboardList },
  { label: "Walk-in Registration", href: "/receptionist/walk-in", icon: UserPlus },
  { label: "Appointments", href: "/receptionist/appointments", icon: Calendar },
  { label: "Reports", href: "/receptionist/reports", icon: FileText },
  { label: "Settings", href: "/receptionist/settings", icon: Settings },
];

const DOCTOR_NAV: NavItem[] = [
  { label: "Schedule", href: "/doctor/schedule", icon: Stethoscope },
  { label: "Manage Availability", href: "/doctor/availability", icon: Clock },
];

const PATIENT_NAV: NavItem[] = [
  { label: "Book Appointment", href: "/patient/book", icon: BookOpen },
  { label: "My Appointments", href: "/patient/appointments", icon: ClipboardList },
];

const NAV_MAP: Record<string, NavItem[]> = {
  receptionist: RECEPTIONIST_NAV,
  doctor: DOCTOR_NAV,
  patient: PATIENT_NAV,
};

export function RoleSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const items = NAV_MAP[role] ?? [];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={`/${role}`} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <LayoutDashboard className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{CLINIC.name}</span>
                <span className="truncate text-xs text-muted-foreground capitalize">
                  {role}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={pathname === item.href}
                tooltip={item.label}
                render={<Link href={item.href} />}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
