"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut } from "lucide-react";

const ROLE_LABEL = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Receptionist",
} as const;

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
    <header className="flex items-center justify-between border-b border-[var(--border)] bg-white/80 backdrop-blur-sm px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-[var(--gold)]"
        />
        <p
          className="truncate text-sm font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {CLINIC.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="hidden text-sm text-muted-foreground sm:block">
          {name || ROLE_LABEL[role]} · {ROLE_LABEL[role]}
        </p>
        <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--primary)] sm:hidden">
          {ROLE_LABEL[role]}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          disabled={signingOut}
          className="min-h-9 gap-1.5 text-muted-foreground hover:text-[var(--foreground)]"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
