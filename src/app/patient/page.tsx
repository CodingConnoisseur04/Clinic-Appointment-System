"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  createAppointment,
} from "@/lib/booking/create-appointment";
import { SlotPicker, toDateInput } from "@/components/booking/slot-picker";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type MyAppointmentRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  reason: string | null;
  payment_method: "cash" | "gcash" | null;
  payment_reference: string | null;
};

export default function PatientPage() {
  const supabase = createClient();
  const router = useRouter();

  const [profile, setProfile] = useState<{
    id: string;
    fullName: string;
    phone: string;
  } | null>(null);

  // Booking form
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [slot, setSlot] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);

  // My appointments
  const [appointments, setAppointments] = useState<MyAppointmentRow[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);

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
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const fetchAppointments = useCallback(async () => {
    const { data } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, reason, payment_method, payment_reference"
      )
      .order("appointment_date", { ascending: false })
      .order("appointment_time");
    return (data ?? []) as unknown as MyAppointmentRow[];
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    fetchAppointments().then((rows) => {
      if (!cancelled) {
        setAppointments(rows);
        setLoadingAppts(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAppointments]);

  async function refreshAppointments() {
    setAppointments(await fetchAppointments());
  }

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

    // Session-drift guard: if the signed-in user changed since this page
    // loaded (e.g. another tab logged into a different account — shared
    // per-origin storage), stop instead of writing under the wrong session.
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
        setSubmittedMsg(
          "Request received. Our staff will contact you to confirm payment and details."
        );
        resetBookingForm();
        await refreshAppointments();
      } else if (result.reason === "SLOT_TAKEN") {
        toast.error(
          "That slot is no longer available — please pick another time."
        );
        resetBookingForm();
      } else {
        toast.error(`Could not submit request: ${result.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 gap-6 bg-zinc-50 p-6 dark:bg-black">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Patient Dashboard
        </h1>
        <Badge variant="outline">Patient</Badge>
      </header>

      {/* ---- Book an Appointment ---- */}
      <Card>
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
              className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
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
                  Requesting {toDateInput(date)} at {slot}.
                </p>
              )}
              <Button
                onClick={submitRequest}
                disabled={
                  submitting || !date || !slot || !fullName.trim() || !phone.trim()
                }
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

      {/* ---- My Appointments ---- */}
      <Card>
        <CardHeader>
          <CardTitle>My Appointments</CardTitle>
          <CardDescription>
            Your requests and bookings. To change or cancel one, contact the
            clinic — staff handle changes on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAppts ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No appointments yet — submit your first request above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.appointment_date}</TableCell>
                    <TableCell>{row.appointment_time.slice(0, 5)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "CONFIRMED"
                            ? "default"
                            : row.status === "PENDING"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.reason ?? "—"}</TableCell>
                    <TableCell>
                      {row.status === "CONFIRMED"
                        ? `${row.payment_method ?? "?"}${
                            row.payment_reference ? ` · ${row.payment_reference}` : ""
                          }`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
