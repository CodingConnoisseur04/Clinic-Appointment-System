"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime12h } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AppointmentRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  reason: string | null;
  payment_method: "cash" | "gcash" | null;
  payment_reference: string | null;
};

export default function PatientAppointmentsPage() {
  const supabase = createClient();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAppointments = useCallback(async () => {
    const { data } = await supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, status, reason, payment_method, payment_reference")
      .order("appointment_date", { ascending: false })
      .order("appointment_time");
    return (data ?? []) as unknown as AppointmentRow[];
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    fetchAppointments().then((rows) => {
      if (!cancelled) {
        setAppointments(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [fetchAppointments]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          My Appointments
        </h1>
      </header>

      <Card className="shadow-warm">
        <CardHeader>
          <CardTitle>My Appointments</CardTitle>
          <CardDescription>
            Your requests and bookings. To change or cancel one, contact the
            clinic — staff handle changes on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No appointments yet — submit a request via Book Appointment.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
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
                      <TableCell>{formatTime12h(row.appointment_time)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.status === "CONFIRMED"
                              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : row.status === "PENDING"
                                ? "bg-[var(--secondary)] text-[var(--secondary-foreground)]"
                                : "bg-[var(--destructive)] text-white"
                          }`}
                        >
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell>{row.reason ?? "—"}</TableCell>
                      <TableCell>
                        {row.status === "CONFIRMED"
                          ? `${row.payment_method ?? "?"}${row.payment_reference ? ` · ${row.payment_reference}` : ""}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
