"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createAppointment } from "@/lib/booking/create-appointment";
import { SlotPicker, toDateInput } from "@/components/booking/slot-picker";
import { formatTime12h } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
export default function BookPage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<{
    id: string;
    fullName: string;
    phone: string;
  } | null>(null);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", data.user.id)
        .single()
        .then(({ data: prof }) => {
          if (cancelled || !prof) return;
          setProfile({ id: prof.id, fullName: prof.full_name ?? "", phone: prof.phone ?? "" });
          setFullName(prof.full_name ?? "");
          setPhone(prof.phone ?? "");
        });
    });
    return () => { cancelled = true; };
  }, [supabase]);

  function resetBookingForm() {
    setSlot(null);
    setReason("");
    setRefreshKey((k) => k + 1);
  }

  async function submitRequest() {
    if (!profile || !slot || !fullName.trim() || !phone.trim()) {
      toast.error("Name, phone, date, and time slot are required.");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user || data.user.id !== profile.id) {
      toast.error("Your session changed — reloading. Please try again.");
      router.refresh();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/patients/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          fullName: fullName.trim(),
          profileId: profile.id,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.patientId) {
        toast.error(body.error ?? "Could not register your details");
        return;
      }

      const result = await createAppointment(supabase, {
        patientId: body.patientId,
        appointmentDate: date ? toDateInput(date) : "",
        appointmentTime: slot,
        reason: reason || undefined,
        source: "online",
      });

      if (result.success) {
        setSubmittedMsg("Request received. Our staff will contact you to confirm payment and details.");
        resetBookingForm();
      } else if (result.reason === "SLOT_TAKEN") {
        toast.error("That slot is no longer available — please pick another time.");
        resetBookingForm();
      } else {
        toast.error(`Could not submit request: ${result.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Book an Appointment
        </h1>
      </header>

      <Card className="shadow-warm">
        <CardHeader>
          <CardTitle>Book an Appointment</CardTitle>
          <CardDescription>
            Pick a date and an open time, confirm your contact details, then
            submit a request. Staff will contact you to arrange payment and
            confirm — requests are not instant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submittedMsg && (
            <div
              className="mb-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
              role="status"
            >
              {submittedMsg}
            </div>
          )}
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="flex justify-center">
              <SlotPicker
                date={date}
                onDateChange={(d) => {
                  setDate(d);
                  setSlot(null);
                  setSubmittedMsg(null);
                }}
                selected={slot}
                onSelect={(t) => setSlot(t)}
                refreshKey={refreshKey}
              />
            </div>
            <div className="flex flex-col gap-3">
              <CardTitle className="text-base">Your details</CardTitle>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pt-name">Full name</Label>
                <Input
                  id="pt-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pt-phone">Phone</Label>
                <Input
                  id="pt-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <CardTitle className="text-base">Request</CardTitle>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pt-reason">Reason for visit (optional)</Label>
                <Textarea
                  id="pt-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              {date && slot && (
                <p className="text-sm text-muted-foreground">
                  Requesting {toDateInput(date)} at {formatTime12h(slot)}.
                </p>
              )}
              <Button
                onClick={submitRequest}
                disabled={submitting || !date || !slot || !fullName.trim() || !phone.trim()}
              >
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Payment is arranged with our staff when they contact you —
                nothing is charged through this site.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
