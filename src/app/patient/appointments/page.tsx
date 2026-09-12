"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatDateShort,
  formatTime12h,
  todayIso,
} from "@/lib/utils";
import { PageMasthead } from "@/components/console/page-masthead";
import { CLINIC } from "@/lib/brand";
import { EmptyState } from "@/components/console/empty-state";
import {
  Ledger,
  LedgerHeading,
  LedgerRow,
  LedgerTime,
} from "@/components/console/ledger";
import { StatusMark } from "@/components/console/status-mark";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  const today = todayIso();
  const upcoming = appointments
    .filter((a) => a.appointment_date >= today && a.status !== "CANCELLED")
    .sort((a, b) =>
      a.appointment_date === b.appointment_date
        ? a.appointment_time.localeCompare(b.appointment_time)
        : a.appointment_date.localeCompare(b.appointment_date)
    );
  const past = appointments.filter(
    (a) => a.appointment_date < today || a.status === "CANCELLED"
  );

  function renderRows(rows: AppointmentRow[], offset = 0) {
    return rows.map((row, i) => (
      <LedgerRow key={row.id} index={i + offset}>
        <LedgerTime muted>
          {formatDateShort(row.appointment_date)}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {formatTime12h(row.appointment_time)}
          </span>
        </LedgerTime>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <StatusMark status={row.status} />
            {row.status === "PENDING" && (
              <span className="text-xs text-muted-foreground">
                Waiting on the front desk, nothing is confirmed yet
              </span>
            )}
          </div>
          {row.reason && (
            <p className="text-sm text-pretty text-muted-foreground">{row.reason}</p>
          )}
          {row.status === "CONFIRMED" && row.payment_method && (
            <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              <span className="text-meta uppercase">
                Paid by {row.payment_method === "cash" ? "cash" : "GCash"}
              </span>
              {row.payment_reference && (
                <span className="figure text-foreground">{row.payment_reference}</span>
              )}
            </p>
          )}
        </div>
      </LedgerRow>
    ));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Your records"
        title="My appointments"
        image={CLINIC.images.waitingRoom}
        lead="Everything you have requested or booked with the clinic. To move or cancel one, call the front desk: changes are always handled by staff, never from here."
        actions={
          <Link
            href="/patient/book"
            className={cn(buttonVariants({ variant: "field", size: "sm" }), "h-9 px-3.5")}
          >
            Request an appointment
          </Link>
        }
      />

      {loading ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : appointments.length === 0 ? (
        <EmptyState
          title="Nothing booked yet"
          description="When you send a request, it appears here so you can follow it from received to confirmed."
          action={
            <Link href="/patient/book" className={cn(buttonVariants({ size: "sm" }), "h-9 px-3.5")}>
              Request an appointment
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            {upcoming.length > 0 && (
              <section>
                <LedgerHeading trailing={`${upcoming.length} ahead`}>
                  Upcoming
                </LedgerHeading>
                <Ledger>{renderRows(upcoming)}</Ledger>
              </section>
            )}
            {past.length > 0 && (
              <section>
                <LedgerHeading
                  trailing={`${past.length} record${past.length === 1 ? "" : "s"}`}
                  className={upcoming.length > 0 ? "mt-8" : undefined}
                >
                  Past and cancelled
                </LedgerHeading>
                <Ledger>{renderRows(past, upcoming.length)}</Ledger>
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
