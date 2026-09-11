"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_HOME: Record<string, string> = {
  patient: "/patient",
  doctor: "/doctor",
  receptionist: "/receptionist",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setError("That email and password did not match. Check both and try again.");
      setSubmitting(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    router.push(ROLE_HOME[profile?.role ?? "patient"] ?? "/patient");
    router.refresh();
  }

  return (
    <AuthShell
      title="Welcome back"
      description={
        <>Sign in to your account at {CLINIC.name}.</>
      }
      footer={
        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          New patient?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline underline-offset-2 hover:text-[var(--gold-ink)]"
          >
            Create an account
          </Link>{" "}
          to request an appointment.
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="text-sm text-pretty text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="h-10 w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
