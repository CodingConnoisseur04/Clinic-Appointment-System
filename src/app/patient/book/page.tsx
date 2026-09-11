"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createAppointment } from "@/lib/booking/create-appointment";
import { SlotPicker, toDateInput } from "@/components/booking/slot-picker";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import { PageMasthead } from "@/components/console/page-masthead";
import { StepRail, type Step } from "@/components/console/step-rail";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const [receipt, setReceipt] = useState<{ date: string; time: string } | null>(
    null
  );

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
      toast.error("Your session changed. Reloading, please try again.");
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

      const requestedDate = date ? toDateInput(date) : "";
      const requestedTime = slot;

      const result = await createAppointment(supabase, {
        patientId: body.patientId,
        appointmentDate: requestedDate,
        appointmentTime: requestedTime,
        reason: reason || undefined,
        source: "online",
      });

      if (result.success) {
        setReceipt({ date: requestedDate, time: requestedTime });
        resetBookingForm();
      } else if (result.reason === "SLOT_TAKEN") {
        toast.error("That time was taken while you were typing, please pick another.");
        resetBookingForm();
      } else {
        toast.error(`Could not submit request: ${result.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const steps: Step[] = [
    {
      label: "Choose a day",
      hint: date ? undefined : "Open days only",
      state: date ? "done" : "current",
    },
    {
      label: "Choose a time",
      hint: !date ? "Pick a day first" : slot ? undefined : "Open times only",
      state: !date ? "todo" : slot ? "done" : "current",
    },
    {
      label: "Confirm your details",
      hint: slot ? undefined : "After you pick a time",
      state: slot ? "current" : "todo",
    },
  ];

  if (receipt) {
    return (
      <div className="flex flex-col gap-6">
        <PageMasthead
          meta="Request received"
          title="We have your request"
          lead="Nothing is confirmed yet. The front desk will contact you to arrange payment, then confirm the appointment and text you."
        />
        <Card className="relative max-w-xl overflow-hidden">
          <span aria-hidden className="rule-gold absolute inset-x-0 top-0 h-px" />
          <CardContent className="flex flex-col gap-5 pt-5">
            <div>
              <p className="text-meta text-muted-foreground uppercase">
                You asked for
              </p>
              <p className="font-heading text-title mt-2">
                {formatDateLong(receipt.date)}
              </p>
              <p className="figure mt-1 text-data text-muted-foreground">
                {formatTime12h(receipt.time)}
              </p>
            </div>
            <ol className="flex flex-col gap-2 border-t border-border pt-5 text-sm">
              <li className="flex gap-3">
                <span className="figure text-xs text-muted-foreground">01</span>
                <span>The front desk reviews your request and calls you.</span>
              </li>
              <li className="flex gap-3">
                <span className="figure text-xs text-muted-foreground">02</span>
                <span>
                  Payment is arranged with the clinic (cash or GCash). Nothing is
                  charged on this site.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="figure text-xs text-muted-foreground">03</span>
                <span>
                  Once confirmed, you get a text message with your appointment
                  details. Until then, treat the time as a request, not a booking.
                </span>
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setReceipt(null)}>Request another time</Button>
              <Link
                href="/patient/appointments"
                className={cn(buttonVariants({ variant: "outline" }), "h-8")}
              >
                My appointments
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Request a visit"
        title="Pick a time that suits you"
        lead="Send a request in three short steps. The front desk confirms it after arranging payment; requests are never confirmed instantly."
        actions={
          <Link
            href="/patient/appointments"
            className={cn(buttonVariants({ variant: "field-outline", size: "sm" }), "h-9 px-3.5")}
          >
            My appointments
          </Link>
        }
      />

      <StepRail steps={steps} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>When would you like to come in?</CardTitle>
            </CardHeader>
            <CardContent>
              <SlotPicker
                date={date}
                onDateChange={(d) => {
                  setDate(d);
                  setSlot(null);
                }}
                selected={slot}
                onSelect={(t) => setSlot(t)}
                refreshKey={refreshKey}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who is the appointment for?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-name">Full name</Label>
                  <Input
                    id="pt-name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pt-phone">Mobile number</Label>
                  <Input
                    id="pt-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This is the number we text your confirmation to.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pt-reason">Reason for the visit (optional)</Label>
                <Textarea
                  id="pt-reason"
                  rows={3}
                  placeholder="A short note helps the doctor prepare. Skip it if you would rather explain in person."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Your request</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-3 border-b border-border pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-meta text-muted-foreground uppercase">Day</dt>
                  <dd className="figure text-sm text-right">
                    {date ? formatDateLong(toDateInput(date)) : "Not chosen"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-meta text-muted-foreground uppercase">Time</dt>
                  <dd
                    className={cn(
                      "figure text-sm",
                      slot ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {slot ? formatTime12h(slot) : "Not chosen"}
                  </dd>
                </div>
              </dl>

              <ol className="flex flex-col gap-2.5 text-xs text-pretty text-muted-foreground">
                <li className="flex gap-2.5">
                  <span className="figure text-meta">01</span>
                  <span>We receive your request.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="figure text-meta">02</span>
                  <span>
                    The front desk calls to arrange payment (cash or GCash).
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="figure text-meta">03</span>
                  <span>We confirm, and you get a text message.</span>
                </li>
              </ol>

              <Button
                onClick={submitRequest}
                disabled={
                  submitting || !date || !slot || !fullName.trim() || !phone.trim()
                }
                className="w-full"
              >
                {submitting ? "Sending request…" : "Send request"}
              </Button>
              <p className="text-xs text-pretty text-muted-foreground">
                No payment happens on this site. The clinic will never ask you to
                pay through this page.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
