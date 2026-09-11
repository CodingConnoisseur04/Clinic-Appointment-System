"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  getClinicSettings,
  isPlaceholderPhone,
  upsertClinicSetting,
} from "@/lib/clinic-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageMasthead } from "@/components/console/page-masthead";
import { TriangleAlert } from "lucide-react";

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

  const stillPlaceholder = !loading && isPlaceholderPhone(phone);

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Clinic"
        title="Settings"
        lead="The details patients see when they need to reach the clinic. Whatever is set here is what the public page prints."
      />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Public phone number</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {stillPlaceholder && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-[var(--gold)]/45 bg-[var(--gold)]/8 px-3.5 py-3 text-sm"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-[var(--gold-ink)]"
                aria-hidden="true"
              />
              <p className="text-pretty">
                This is still the placeholder number. Patients see it on the
                clinic&apos;s public page, where a number that looks made up costs
                trust. Replace it with the real line.
              </p>
            </div>
          )}

          {loading ? (
            <Skeleton className="h-9 rounded-lg" />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="receptionist-phone">Number patients should call</Label>
              <Input
                id="receptionist-phone"
                name="receptionist_phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xx xxx xxxx"
                className="figure"
              />
              <p className="text-xs text-muted-foreground">
                Shown on the clinic&apos;s home page. It is the only number the
                public ever sees.
              </p>
            </div>
          )}

          <Button onClick={handleSave} disabled={loading || saving} className="self-start">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
