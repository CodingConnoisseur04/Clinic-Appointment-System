"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  getClinicSettings,
  upsertClinicSetting,
} from "@/lib/clinic-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const supabase = createClient();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClinicSettings(supabase).then((s) => {
      if (!cancelled) {
        setPhone(s.receptionist_phone);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSave() {
    if (!phone.trim()) {
      toast.error("Phone number cannot be empty.");
      return;
    }
    setSaving(true);
    const result = await upsertClinicSetting(
      supabase,
      "receptionist_phone",
      phone.trim()
    );
    setSaving(false);
    if (result.success) {
      toast.success("Settings saved.");
    } else {
      toast.error(result.error ?? "Failed to save.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Settings
        </h1>
      </header>

      <Card className="max-w-lg shadow-warm">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>
            This phone number is shown to patients on the home page and used
            for clinic contact inquiries.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="receptionist-phone">
              Receptionist phone number
            </Label>
            <Input
              id="receptionist-phone"
              name="receptionist_phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xx xxx xxxx"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Patients will see this number when they need to contact the
              clinic.
            </p>
          </div>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
