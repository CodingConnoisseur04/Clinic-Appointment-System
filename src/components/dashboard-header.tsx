"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ClinicSeal } from "@/components/clinic-seal";
import { LogOut } from "lucide-react";

const ROLE_LABEL = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Front desk",
} as const;

const ROLE_SCOPE = {
  patient: "Patient",
  doctor: "Consulting room",
  receptionist: "Front desk",
} as const;

/*
 * The chrome bar stays deliberately quiet: identity lives in the sidebar and
 * each page's masthead. No backdrop blur — depth in this world comes from warm
 * offset shadows, never from glass.
 */
export function DashboardHeader({
  name,
  role,
}: {
  name: string;
  role: keyof typeof ROLE_LABEL;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-1 md:hidden" />
        <ClinicSeal size="sm" className="md:hidden" />
        <p className="text-meta truncate text-muted-foreground uppercase md:hidden">
          {ROLE_SCOPE[role]}
        </p>
        <p className="hidden truncate text-sm text-muted-foreground md:block">
          <span className="font-medium text-foreground">{name || ROLE_LABEL[role]}</span>
          <span aria-hidden className="mx-2 text-border">
            ·
          </span>
          {ROLE_LABEL[role]}
          <span aria-hidden className="mx-2 text-border">
            ·
          </span>
          {CLINIC.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          disabled={signingOut}
          className="min-h-9 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
