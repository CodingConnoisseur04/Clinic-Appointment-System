"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  FileText,
  Home,
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
import { ClinicSeal } from "@/components/clinic-seal";
import { CLINIC } from "@/lib/brand";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  /** Tracked label above the group. Omitted for the primary group. */
  heading?: string;
  items: NavItem[];
};

const RECEPTIONIST_NAV: NavSection[] = [
  {
    items: [
      { label: "Today's desk", href: "/receptionist", icon: Home },
      { label: "Requests to action", href: "/receptionist/pending", icon: ClipboardList },
      { label: "Register a walk-in", href: "/receptionist/walk-in", icon: UserPlus },
    ],
  },
  {
    heading: "Records",
    items: [
      { label: "All appointments", href: "/receptionist/appointments", icon: Calendar },
      { label: "Reports", href: "/receptionist/reports", icon: FileText },
    ],
  },
  {
    heading: "Clinic",
    items: [{ label: "Settings", href: "/receptionist/settings", icon: Settings }],
  },
];

const DOCTOR_NAV: NavSection[] = [
  {
    items: [
      { label: "Your schedule", href: "/doctor/schedule", icon: Stethoscope },
      { label: "Working hours", href: "/doctor/availability", icon: Clock },
    ],
  },
];

const PATIENT_NAV: NavSection[] = [
  {
    items: [
      { label: "Book an appointment", href: "/patient/book", icon: BookOpen },
      { label: "My appointments", href: "/patient/appointments", icon: ClipboardList },
    ],
  },
];

const NAV_MAP: Record<string, NavSection[]> = {
  receptionist: RECEPTIONIST_NAV,
  doctor: DOCTOR_NAV,
  patient: PATIENT_NAV,
};

const SCOPE_LABEL: Record<string, string> = {
  receptionist: "Front desk",
  doctor: "Consulting room",
  patient: "Patient",
};

export function RoleSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = NAV_MAP[role] ?? [];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href={`/${role}`} />}
              className="gap-2.5"
            >
              <ClinicSeal />
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-heading truncate text-base text-sidebar-foreground">
                  {CLINIC.name}
                </span>
                <span className="text-meta text-sidebar-accent-foreground/55 uppercase">
                  {SCOPE_LABEL[role] ?? role}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        {sections.map((section, index) => (
          <div key={section.heading ?? `section-${index}`}>
            {section.heading ? (
              <p className="text-meta px-3 pt-4 pb-1.5 text-sidebar-accent-foreground/45 uppercase">
                {section.heading}
              </p>
            ) : null}
            <SidebarMenu className={section.heading ? undefined : "pt-2"}>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                      /* Gold marks where you are standing. */
                      className={
                        active
                          ? "relative before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-[var(--gold)]"
                          : undefined
                      }
                    >
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <p className="text-meta px-3 pb-1 text-sidebar-accent-foreground/40 uppercase">
          {CLINIC.address}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
