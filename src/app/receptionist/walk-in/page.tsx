"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  createAppointment,
  type CreateAppointmentInput,
} from "@/lib/booking/create-appointment";
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Walk-in Registration</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>1. Patient</CardTitle>
            <CardDescription>
              {wiExisting
                ? "Existing record loaded — reuse, no duplicate."
                : "New walk-in — record created on submit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="wi-phone">Phone</Label>
                <Input
                  id="wi-phone"
                  value={wiPhone}
                  onChange={(e) => setWiPhone(e.target.value)}
                  placeholder="09xx xxx xxxx"
                />
              </div>
              <Button variant="secondary" onClick={lookupPhone}>
                Look up
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-name">Full name</Label>
              <Input
                id="wi-name"
                value={wiFullName}
                onChange={(e) => setWiFullName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-email">Email (optional)</Label>
              <Input
                id="wi-email"
                type="email"
                value={wiEmail}
                onChange={(e) => setWiEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-dob">Date of birth (optional)</Label>
              <Input
                id="wi-dob"
                type="date"
                value={wiDob}
                onChange={(e) => setWiDob(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-address">Address (optional)</Label>
              <Textarea
                id="wi-address"
                rows={2}
                value={wiAddress}
                onChange={(e) => setWiAddress(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Schedule</CardTitle>
            <CardDescription>Pick a date, then an open slot.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <SlotPicker
              date={wiDate}
              onDateChange={onPickDate}
              selected={wiSlot}
              onSelect={setWiSlot}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Confirm &amp; pay</CardTitle>
            <CardDescription>
              Walk-ins are confirmed immediately with payment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-reason">Reason (optional)</Label>
              <Textarea
                id="wi-reason"
                rows={2}
                value={wiReason}
                onChange={(e) => setWiReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="wi-ref">Payment reference</Label>
              <Input
                id="wi-ref"
                value={wiReference}
                onChange={(e) => setWiReference(e.target.value)}
                placeholder="e.g. receipt # / GCash ref"
              />
            </div>
            <Button
              onClick={submitWalkin}
              disabled={wiSubmitting || !wiDate || !wiSlot || !wiFullName.trim()}
            >
              {wiSubmitting ? "Booking…" : "Book & confirm"}
            </Button>
            {wiSlot && wiDate && (
              <p className="text-xs text-muted-foreground">
                Booking {toDateInput(wiDate)} at {wiSlot}
                {wiExisting ? " for existing patient" : " as new patient"}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
