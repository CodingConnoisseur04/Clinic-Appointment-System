"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { CLINIC } from "@/lib/brand";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const signupSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(1, "Full name is required"),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, "Enter a valid mobile number (digits, optional +)"),
});

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    fullName: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      // user_metadata only — never pass a role; profiles.role is assigned by
      // the handle_new_user trigger and defaults to 'patient'.
      const { data, error } = await createClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: {
            full_name: parsed.data.fullName,
            phone: parsed.data.phone,
          },
        },
      });

      if (error || !data.session) {
        setError(
          error?.message.includes("already") ?? false
            ? "An account with this email already exists, sign in instead."
            : (error?.message ?? "We could not create the account. Try again.")
        );
        return;
      }

      router.push("/patient");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description={
        <>
          Register once at {CLINIC.name}, then request appointments whenever you
          need one.
        </>
      }
      footer={
        <p className="border-t border-border pt-6 text-sm text-muted-foreground">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline underline-offset-2 hover:text-[var(--gold-ink)]"
          >
            Sign in
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={set("fullName")}
            placeholder="Juan dela Cruz"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Mobile number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+639171234567"
            required
            value={form.phone}
            onChange={set("phone")}
          />
          <p className="text-xs text-pretty text-muted-foreground">
            We confirm and remind you by text, so this needs to be a number you
            actually read. It is also how the front desk finds your existing
            record instead of making a second one.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            required
            value={form.email}
            onChange={set("email")}
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={set("password")}
            placeholder="At least 8 characters"
          />
        </div>

        {error && (
          <p className="text-sm text-pretty text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={submitting} className="h-10 w-full">
          {submitting ? "Creating account…" : "Create account"}
        </Button>

        <p className="text-xs text-pretty text-muted-foreground">
          Nothing is charged on this site. Payment is arranged with the front desk
          after you send a request.
        </p>
      </form>
    </AuthShell>
  );
}
