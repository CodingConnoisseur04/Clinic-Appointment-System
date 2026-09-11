"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  createAppointment,
  type CreateAppointmentInput,
} from "@/lib/booking/create-appointment";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SlotPicker, toDateInput } from "@/components/booking/slot-picker";
import { useAppointments } from "@/hooks/use-appointments";
import { PageMasthead } from "@/components/console/page-masthead";
import { StepRail, type Step } from "@/components/console/step-rail";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import { BadgeCheck, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export default function WalkInPage() {
  const supabase = createClient();
  const { refresh } = useAppointments();
  const [myProfileId, setMyProfileId] = useState<string | null>(null);

  const [wiPhone, setWiPhone] = useState("");
  const [wiFullName, setWiFullName] = useState("");
  const [wiEmail, setWiEmail] = useState("");
  const [wiDob, setWiDob] = useState("");
  const [wiAddress, setWiAddress] = useState("");
  const [wiExisting, setWiExisting] = useState(false);
  const [wiDate, setWiDate] = useState<Date | undefined>(undefined);
  const [wiSlot, setWiSlot] = useState<string | null>(null);
  const [wiReason, setWiReason] = useState("");
  const [wiMethod, setWiMethod] = useState<"cash" | "gcash">("cash");
  const [wiReference, setWiReference] = useState("");
  const [wiSubmitting, setWiSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) setMyProfileId(data.user.id);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  function resetForm() {
    setWiPhone("");
    setWiFullName("");
    setWiEmail("");
    setWiDob("");
    setWiAddress("");
    setWiExisting(false);
    setWiDate(undefined);
    setWiSlot(null);
    setWiReason("");
    setWiMethod("cash");
    setWiReference("");
  }

  async function lookupPhone() {
    const phone = wiPhone.trim();
    if (!phone) return;
    const { data } = await supabase
      .from("patients")
      .select("id, full_name, email, date_of_birth, address, profile_id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (data) {
      setWiExisting(true);
      setWiFullName(data.full_name ?? "");
      setWiEmail(data.email ?? "");
      setWiDob(data.date_of_birth ?? "");
      setWiAddress(data.address ?? "");
      toast.info("Existing patient record found — details loaded.");
    } else {
      setWiExisting(false);
      setWiFullName("");
      setWiEmail("");
      setWiDob("");
      setWiAddress("");
      toast.info("No existing record — a new one will be created.");
    }
  }

  function onPickDate(date: Date | undefined) {
    setWiDate(date);
    setWiSlot(null);
  }

  async function submitWalkin() {
    if (!wiDate || !wiSlot || !wiFullName.trim()) {
      toast.error("Name, date, and time slot are required.");
      return;
    }
    setWiSubmitting(true);
    try {
      const res = await fetch("/api/patients/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: wiPhone.trim(),
          fullName: wiFullName.trim(),
          ...(wiEmail ? { email: wiEmail } : {}),
          ...(wiDob ? { dateOfBirth: wiDob } : {}),
          ...(wiAddress ? { address: wiAddress } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.patientId) {
        toast.error(body.error ?? "Patient lookup failed");
        return;
      }

      const input: CreateAppointmentInput = {
        patientId: body.patientId,
        appointmentDate: toDateInput(wiDate),
        appointmentTime: wiSlot,
        reason: wiReason || undefined,
        source: "walk_in",
        status: "CONFIRMED",
        handledBy: myProfileId ?? undefined,
        paymentMethod: wiMethod,
        paymentReference: wiReference || undefined,
      };
      const result = await createAppointment(supabase, input);
      if (result.success) {
        toast.success("Walk-in booked and confirmed.");
        resetForm();
        await refresh();
      } else {
        toast.error(`${result.reason}: ${result.message}`);
      }
    } finally {
      setWiSubmitting(false);
    }
  }

  const patientDone = Boolean(wiPhone.trim() && wiFullName.trim());
  const timeDone = Boolean(wiDate && wiSlot);
  const steps: Step[] = [
    {
      label: "The patient",
      hint: wiExisting ? "Existing record in use" : "Look up the number first",
      state: patientDone ? "done" : "current",
    },
    {
      label: "When they are being seen",
      hint: !patientDone ? "After the patient details" : timeDone ? undefined : "Pick a day and time",
      state: !patientDone ? "todo" : timeDone ? "done" : "current",
    },
    {
      label: "Payment and confirm",
      hint: "Confirms instantly — no request stage",
      state: timeDone ? "current" : "todo",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Front desk"
        title="Register a walk-in"
        lead="Take the booking and the payment in one pass. Walk-ins are confirmed immediately, so the slot is held the moment you finish."
      />

      <StepRail steps={steps} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="figure grid size-6 place-items-center rounded-md border border-border text-xs text-muted-foreground"
              >
                1
              </span>
              The patient
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wi-phone">Mobile number</Label>
              <div className="flex gap-2">
                <Input
                  id="wi-phone"
                  type="tel"
                  inputMode="tel"
                  value={wiPhone}
                  onChange={(e) => setWiPhone(e.target.value)}
                  placeholder="09xx xxx xxxx"
                  className="flex-1"
                />
                <Button variant="outline" onClick={lookupPhone} className="gap-1.5">
                  <Search className="size-3.5" aria-hidden="true" />
                  Look up
                </Button>
              </div>
              <p
                className={cn(
                  "mt-1 flex items-start gap-2 text-xs text-pretty",
                  wiExisting ? "text-primary" : "text-muted-foreground"
                )}
              >
                {wiExisting ? (
                  <>
                    <BadgeCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    Existing record found — it will be reused, so this patient
                    never ends up with two files.
                  </>
                ) : (
                  "Look up the number before filling anything in. One person keeps exactly one record."
                )}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wi-name">Full name</Label>
              <Input
                id="wi-name"
                value={wiFullName}
                onChange={(e) => setWiFullName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wi-email">Email (optional)</Label>
              <Input
                id="wi-email"
                type="email"
                value={wiEmail}
                onChange={(e) => setWiEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wi-dob">Date of birth (optional)</Label>
                <Input
                  id="wi-dob"
                  type="date"
                  value={wiDob}
                  onChange={(e) => setWiDob(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wi-address">Address (optional)</Label>
                <Textarea
                  id="wi-address"
                  rows={2}
                  className="sm:min-h-[2.25rem]"
                  value={wiAddress}
                  onChange={(e) => setWiAddress(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="figure grid size-6 place-items-center rounded-md border border-border text-xs text-muted-foreground"
              >
                2
              </span>
              When they are being seen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SlotPicker
              date={wiDate}
              onDateChange={onPickDate}
              selected={wiSlot}
              onSelect={setWiSlot}
            />
          </CardContent>
        </Card>

        {/* Gold belongs on this card: it is where the money is taken. */}
        <Card className="relative overflow-hidden">
          <span aria-hidden className="rule-gold absolute inset-x-0 top-0 h-px" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="figure grid size-6 place-items-center rounded-md border border-[var(--gold)] text-xs text-[var(--gold-ink)]"
              >
                3
              </span>
              Payment and confirm
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wi-reason">Reason for the visit (optional)</Label>
              <Textarea
                id="wi-reason"
                rows={2}
                value={wiReason}
                onChange={(e) => setWiReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Payment method</Label>
              <Select
                value={wiMethod}
                onValueChange={(v) => setWiMethod(v as "cash" | "gcash")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wi-ref">Payment reference</Label>
              <Input
                id="wi-ref"
                value={wiReference}
                onChange={(e) => setWiReference(e.target.value)}
                placeholder="Receipt number, or GCash reference"
              />
              <p className="text-xs text-muted-foreground">
                Optional, but this is the only record that payment was taken.
              </p>
            </div>

            <dl className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-meta text-muted-foreground uppercase">Patient</dt>
                <dd className="truncate">
                  {wiFullName.trim() || <span className="text-muted-foreground">Not set</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-meta text-muted-foreground uppercase">When</dt>
                <dd className="figure text-right">
                  {wiDate && wiSlot ? (
                    <>
                      {formatDateLong(toDateInput(wiDate))}
                      <span className="mt-0.5 block">{formatTime12h(wiSlot)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-meta text-muted-foreground uppercase">Record</dt>
                <dd>
                  {wiExisting ? "Reusing existing" : "Creating new"}
                </dd>
              </div>
            </dl>

            <Button
              onClick={submitWalkin}
              disabled={wiSubmitting || !wiDate || !wiSlot || !wiFullName.trim()}
              className="h-10 w-full"
            >
              {wiSubmitting ? "Booking…" : "Book & confirm now"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
