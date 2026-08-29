"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      setError("Invalid email or password.");
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
    <div className="page-enter flex flex-1 flex-col items-center justify-center bg-[var(--background)] p-8">
      <Link
        href="/"
        className="mb-6 text-sm text-stone-500 underline-offset-4 hover:text-[var(--primary)] hover:underline"
      >
        ← Back to home
      </Link>
      <Card className="w-full max-w-sm shadow-warm">
        <CardHeader className="text-center">
          <CardTitle
            className="text-2xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Welcome back
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to {CLINIC.name}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
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
            <div className="flex flex-col gap-2">
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
              <p className="text-sm text-[var(--destructive)]" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New patient?{" "}
            <Link href="/signup" className="font-medium text-[var(--primary)] underline underline-offset-2 hover:text-[var(--gold)]">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
