"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  createAppointment,
  type CreateAppointmentInput,
} from "@/lib/booking/create-appointment";
import {
  confirmAppointment,
  rejectAppointment,
  markAttendance,
} from "@/lib/booking/update-appointment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type AppointmentRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  source: "online" | "walk_in";
  reason: string | null;
  attendance: "ATTENDED" | "NO_SHOW" | null;
  payment_method: "cash" | "gcash" | null;
  payment_reference: string | null;
  patients: { full_name: string; phone: string } | null;
};

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateInput(new Date());
}

export default function ReceptionistPage() {
  const supabase = createClient();

  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [confirmTarget, setConfirmTarget] = useState<AppointmentRow | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"cash" | "gcash">("cash");
  const [confirmRef, setConfirmRef] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AppointmentRow | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<{
    row: AppointmentRow;
    mark: "ATTENDED" | "NO_SHOW";
  } | null>(null);

  // Appointments tab filters
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "CONFIRMED" | "CANCELLED">("all");
  const [dateFilter, setDateFilter] = useState("");

  // Walk-in form
  const [wiPhone, setWiPhone] = useState("");
  const [wiFullName, setWiFullName] = useState("");
  const [wiEmail, setWiEmail] = useState("");
  const [wiDob, setWiDob] = useState("");
  const [wiAddress, setWiAddress] = useState("");
  const [wiExisting, setWiExisting] = useState(false);
  const [wiDate, setWiDate] = useState<Date | undefined>(undefined);
  const [wiSlots, setWiSlots] = useState<{ time: string }[]>([]);
  const [wiSlotsLoading, setWiSlotsLoading] = useState(false);
  const [wiSlot, setWiSlot] = useState<string>("");
  const [wiReason, setWiReason] = useState("");
  const [wiMethod, setWiMethod] = useState<"cash" | "gcash">("cash");
  const [wiReference, setWiReference] = useState("");
  const [wiSubmitting, setWiSubmitting] = useState(false);

  const fetchAppointments = useCallback(async () => {
    const { data } = await supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, status, source, reason, attendance, payment_method, payment_reference, patients(full_name, phone)"
      )
      .order("appointment_date")
      .order("appointment_time");
    return (data ?? []) as unknown as AppointmentRow[];
  }, [supabase]);

  const refreshAppointments = useCallback(async () => {
    setAppointments(await fetchAppointments());
  }, [fetchAppointments]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) setMyProfileId(data.user.id);
    });
    fetchAppointments().then((rows) => {
      if (cancelled) return;
      setAppointments(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, fetchAppointments]);

  async function act(fn: () => Promise<{ success: boolean; message?: string }>, okMsg: string) {
    const result = await fn();
    if (result.success) {
      toast.success(okMsg);
      await refreshAppointments();
    } else {
      toast.error(result.message ?? "Action failed");
    }
    return result.success;
  }

  const pendingRequests = appointments.filter(
    (a) => a.status === "PENDING" && a.source === "online"
  );

  const filteredAppointments = appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (dateFilter && a.appointment_date !== dateFilter) return false;
    return true;
  });

  function resetWalkinForm() {
    setWiPhone("");
    setWiFullName("");
    setWiEmail("");
    setWiDob("");
    setWiAddress("");
    setWiExisting(false);
    setWiDate(undefined);
    setWiSlots([]);
    setWiSlot("");
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

  async function onPickDate(date: Date | undefined) {
    setWiDate(date);
    setWiSlot("");
    setWiSlots([]);
    if (!date) return;
    setWiSlotsLoading(true);
    try {
      const res = await fetch(`/api/available-slots?date=${toDateInput(date)}`);
      const body = await res.json();
      setWiSlots(res.ok ? (body.slots ?? []) : []);
      if (!res.ok) toast.error(body.error ?? "Failed to load slots");
    } catch {
      toast.error("Failed to reach slot API");
    } finally {
      setWiSlotsLoading(false);
    }
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
        toast.success(`Walk-in booked and confirmed.`);
        resetWalkinForm();
        await refreshAppointments();
      } else {
        toast.error(`${result.reason}: ${result.message}`);
      }
    } finally {
      setWiSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 gap-6 bg-zinc-50 p-6 dark:bg-black">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Receptionist Dashboard
        </h1>
        <Badge variant="outline">Front desk</Badge>
      </header>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            Pending Requests
            {pendingRequests.length > 0 && (
              <Badge className="ml-2">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="walkin">Walk-in Registration</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
        </TabsList>

        {/* ---- Tab 1: Pending Requests ---- */}
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending online requests</CardTitle>
              <CardDescription>
                Confirm (with payment) or reject each request. Confirming does
                not send SMS yet (not implemented until the SMS phase).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pending online requests. (Seed test requests via Phase
                  3&apos;s createAppointment while the patient UI is unbuilt.)
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.appointment_date}</TableCell>
                        <TableCell>{row.appointment_time.slice(0, 5)}</TableCell>
                        <TableCell>{row.patients?.full_name}</TableCell>
                        <TableCell>{row.patients?.phone}</TableCell>
                        <TableCell>{row.reason ?? "—"}</TableCell>
                        <TableCell className="space-x-2 text-right">
                          <Button size="sm" onClick={() => setConfirmTarget(row)}>
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectTarget(row)}
                          >
                            Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Tab 2: Walk-in Registration ---- */}
        <TabsContent value="walkin" className="mt-4">
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
                <Calendar
                  mode="single"
                  selected={wiDate}
                  onSelect={onPickDate}
                />
                {wiDate && (
                  <p className="text-sm font-medium">{toDateInput(wiDate)}</p>
                )}
                {wiSlotsLoading && (
                  <p className="text-sm text-muted-foreground">
                    Loading slots…
                  </p>
                )}
                {!wiSlotsLoading && wiDate && wiSlots.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No open slots this day (closed or fully booked).
                  </p>
                )}
                {!wiSlotsLoading && wiSlots.length > 0 && (
                  <div className="flex max-h-48 flex-wrap justify-center gap-1 overflow-y-auto">
                    {wiSlots.map((s) => (
                      <Button
                        key={s.time}
                        size="sm"
                        variant={wiSlot === s.time ? "default" : "outline"}
                        onClick={() => setWiSlot(s.time)}
                      >
                        {s.time}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Confirm &amp; pay</CardTitle>
                <CardDescription>
                  Walk-ins are confirmed immediately with payment (Addendum A.2).
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
                  disabled={
                    wiSubmitting || !wiDate || !wiSlot || !wiFullName.trim()
                  }
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
        </TabsContent>

        {/* ---- Tab 3: Appointments ---- */}
        <TabsContent value="appointments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All appointments</CardTitle>
              <CardDescription>
                Mark attendance once dates pass; cancel to free the slot.
                Rescheduling = cancel here + rebook via Walk-in tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Status</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) =>
                      setStatusFilter(v as typeof statusFilter)
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                      <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="filter-date">Date</Label>
                  <Input
                    id="filter-date"
                    type="date"
                    className="w-44"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </div>
                {dateFilter && (
                  <Button variant="ghost" onClick={() => setDateFilter("")}>
                    Clear date
                  </Button>
                )}
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : filteredAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No appointments match the filters.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAppointments.map((row) => {
                      const pastOrToday =
                        row.appointment_date <= todayStr();
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{row.appointment_date}</TableCell>
                          <TableCell>{row.appointment_time.slice(0, 5)}</TableCell>
                          <TableCell>{row.patients?.full_name}</TableCell>
                          <TableCell>
                            {row.source === "online" ? "Online" : "Walk-in"}
                          </TableCell>
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
                          <TableCell>{row.attendance ?? "—"}</TableCell>
                          <TableCell className="space-x-2 text-right">
                            {row.status === "CONFIRMED" && pastOrToday && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={row.attendance === "ATTENDED"}
                                  onClick={() =>
                                    setAttendanceTarget({ row, mark: "ATTENDED" })
                                  }
                                >
                                  Attended
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={row.attendance === "NO_SHOW"}
                                  onClick={() =>
                                    setAttendanceTarget({ row, mark: "NO_SHOW" })
                                  }
                                >
                                  No-show
                                </Button>
                              </>
                            )}
                            {row.status !== "CANCELLED" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setRejectTarget(row)}
                              >
                                Cancel
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- Confirm-payment dialog ---- */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm request</DialogTitle>
            <DialogDescription>
              Log payment, then confirm. No SMS will be sent (not yet
              implemented).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Payment method</Label>
              <Select
                value={confirmMethod}
                onValueChange={(v) => setConfirmMethod(v as "cash" | "gcash")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="confirm-ref">Payment reference</Label>
              <Input
                id="confirm-ref"
                value={confirmRef}
                onChange={(e) => setConfirmRef(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!confirmTarget) return;
                const target = confirmTarget;
                setConfirmTarget(null);
                await act(
                  () =>
                    confirmAppointment(supabase, {
                      appointmentId: target.id,
                      paymentMethod: confirmMethod,
                      paymentReference: confirmRef || undefined,
                    }),
                  "Request confirmed."
                );
                setConfirmRef("");
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Reject/cancel confirm ---- */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment?</DialogTitle>
            <DialogDescription>
              This sets the appointment to CANCELLED and frees the slot. It
              stays in history. No SMS will be sent (not yet implemented).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const target = rejectTarget;
                setRejectTarget(null);
                if (!target) return;
                await act(
                  () => rejectAppointment(supabase, { appointmentId: target.id }),
                  "Appointment cancelled."
                );
              }}
            >
              Cancel it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Attendance confirm ---- */}
      <Dialog
        open={!!attendanceTarget}
        onOpenChange={(o) => !o && setAttendanceTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark as {attendanceTarget?.mark === "ATTENDED" ? "attended" : "no-show"}?
            </DialogTitle>
            <DialogDescription>
              {attendanceTarget?.row.patients?.full_name} —{" "}
              {attendanceTarget?.row.appointment_date}{" "}
              {attendanceTarget?.row.appointment_time.slice(0, 5)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttendanceTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const t = attendanceTarget;
                setAttendanceTarget(null);
                if (!t) return;
                await act(
                  () =>
                    markAttendance(supabase, {
                      appointmentId: t.row.id,
                      attendance: t.mark,
                    }),
                  `Marked ${t.mark}.`
                );
              }}
            >
              Yes, mark it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
