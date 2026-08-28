"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
    <header className="flex items-center justify-between border-b bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-950 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-primary"
        />
        <p className="truncate text-sm font-semibold tracking-tight">
          {CLINIC.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="hidden text-sm text-stone-500 sm:block">
          {name || ROLE_LABEL[role]} · {ROLE_LABEL[role]}
        </p>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 sm:hidden">
          {ROLE_LABEL[role]}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={signOut}
          disabled={signingOut}
          className="min-h-9"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </header>
  );
}
