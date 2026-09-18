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
  const [fee, setFee] = useState("");
  const [discount, setDiscount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getClinicSettings(supabase).then((s) => {
      if (!cancelled) {
        setPhone(s.receptionist_phone);
        setFee(s.consultation_fee ?? "");
        setDiscount(s.senior_discount_percent ?? "");
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
    const feeRaw = fee.trim();
    if (feeRaw !== "") {
      const feeNum = Number(feeRaw);
      if (!Number.isFinite(feeNum) || feeNum < 0 || !Number.isInteger(feeNum)) {
        toast.error("Consultation fee must be a whole peso amount, zero or more.");
        return;
      }
      if (feeNum > 1000000) {
        toast.error("Consultation fee looks too large.");
        return;
      }
    }
    const discountRaw = discount.trim();
    if (discountRaw !== "") {
      const discountNum = Number(discountRaw);
      if (!Number.isFinite(discountNum) || !Number.isInteger(discountNum) || discountNum < 0 || discountNum > 100) {
        toast.error("Senior/PWD discount must be a whole percent, 0 to 100.");
        return;
      }
    }
    setSaving(true);
    const results = [
      await upsertClinicSetting(supabase, "receptionist_phone", phone.trim()),
      ...(feeRaw === ""
        ? []
        : [await upsertClinicSetting(supabase, "consultation_fee", String(Number(feeRaw)))]),
      ...(discountRaw === ""
        ? []
        : [await upsertClinicSetting(supabase, "senior_discount_percent", String(Number(discountRaw)))])
    ];
    setSaving(false);
    if (results.every((r) => r.success)) {
      toast.success("Settings saved.");
    } else {
      toast.error(results.find((r) => !r.success)?.error ?? "Failed to save.");
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="consultation-fee">Consultation fee (₱)</Label>
            <Input
              id="consultation-fee"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="e.g. 500"
              className="figure"
            />
            <p className="text-xs text-muted-foreground">
              Prefilled into the fee field every time payment is logged - at
              confirm, walk-in, or attendance. Still editable per visit.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="senior-discount">Senior/PWD discount (%)</Label>
            <Input
              id="senior-discount"
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="numeric"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="e.g. 20"
              className="figure"
            />
            <p className="text-xs text-muted-foreground">
              Prefilled into the fee for patients marked Senior/PWD (RA 9994
              mandate is 20%). It suggests an amount - you can always override
              the fee per visit.
            </p>
          </div>

          <Button onClick={handleSave} disabled={loading || saving} className="self-start">
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
