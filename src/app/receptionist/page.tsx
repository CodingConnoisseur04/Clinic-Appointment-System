"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort, formatDayHeading, formatTime12h } from "@/lib/utils";
import {
  PageMasthead,
  MastheadStats,
} from "@/components/console/page-masthead";
import { EmptyState } from "@/components/console/empty-state";
import {
  Ledger,
  LedgerHeading,
  LedgerRow,
  LedgerTime,
} from "@/components/console/ledger";
import { StatusMark, SourceTag } from "@/components/console/status-mark";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Phone } from "lucide-react";

type Appointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  source: "online" | "walk_in";
  reason: string | null;
  patients: { full_name: string; phone: string } | null;
};

type DeskData = {
  todayIso: string;
  todayHeading: string;
  today: Appointment[];
  tomorrow: Appointment[];
  tomorrowHeading: string;
  confirmedToday: number;
  stillToCome: number;
  pendingCount: number;
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ReceptionistHomePage() {
  const supabase = createClient();
  const [data, setData] = useState<DeskData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = new Date();
      const today = isoDate(now);
      const tomorrowDate = new Date(now);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrow = isoDate(tomorrowDate);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      const [apptsResult, pendingResult] = await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id, appointment_date, appointment_time, status, source, reason, patients(full_name, phone)"
          )
          .in("appointment_date", [today, tomorrow])
          .in("status", ["CONFIRMED", "PENDING"])
          .order("appointment_time"),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("status", "PENDING")
          .eq("source", "online"),
      ]);

      if (cancelled) return;

      const all = (apptsResult.data ?? []) as unknown as Appointment[];
      const todays = all.filter((a) => a.appointment_date === today);
      const confirmedToday = todays.filter((a) => a.status === "CONFIRMED");

      setData({
        todayIso: today,
        todayHeading: formatDayHeading(today),
        today: todays,
        tomorrowHeading: formatDayHeading(tomorrow),
        tomorrow: all.filter((a) => a.appointment_date === tomorrow),
        confirmedToday: confirmedToday.length,
        stillToCome: confirmedToday.filter((a) => {
          const [h, m] = a.appointment_time.split(":").map(Number);
          return h * 60 + m >= nowMinutes;
        }).length,
        pendingCount: pendingResult.count ?? 0,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function renderRows(rows: Appointment[], offset = 0) {
    return rows.map((appt, i) => (
      <LedgerRow key={appt.id} index={i + offset}>
        <LedgerTime>
          {formatTime12h(appt.appointment_time)}
        </LedgerTime>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-sm font-medium">
              {appt.patients?.full_name ?? "Unknown patient"}
            </span>
            <SourceTag source={appt.source} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {appt.patients?.phone && (
              <a
                href={`tel:${appt.patients.phone}`}
                className="figure inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                <Phone className="size-3" aria-hidden="true" />
                {appt.patients.phone}
              </a>
            )}
            {appt.reason && (
              <span className="text-xs text-pretty text-muted-foreground">
                {appt.reason}
              </span>
            )}
          </div>
        </div>
        <div className="col-start-2 sm:col-start-3">
          <StatusMark status={appt.status} />
        </div>
      </LedgerRow>
    ));
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <PageMasthead meta="Front desk" title="Today at the desk" />
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta={data.todayHeading}
        title="Today at the desk"
        lead="Everything booked for today, in the order it arrives. Online requests stay unconfirmed until you act on them."
        actions={
          <>
            {data.pendingCount > 0 && (
              <Link
                href="/receptionist/pending"
                className={cn(
                  buttonVariants({ variant: "gold", size: "sm" }),
                  "h-9 px-3.5"
                )}
              >
                {data.pendingCount} request{data.pendingCount === 1 ? "" : "s"} to action
              </Link>
            )}
            <Link
              href="/receptionist/walk-in"
              className={cn(
                buttonVariants({ variant: "field", size: "sm" }),
                "h-9 px-3.5"
              )}
            >
              Register a walk-in
            </Link>
          </>
        }
      >
        <MastheadStats
          stats={[
            {
              label: "Requests to action",
              value: data.pendingCount,
              tone: data.pendingCount > 0 ? "gold" : "default",
            },
            { label: "Confirmed today", value: data.confirmedToday },
            { label: "Still to come", value: data.stillToCome },
            { label: "Booked tomorrow", value: data.tomorrow.length },
          ]}
        />
      </PageMasthead>

      <Card>
        <CardContent className="pt-4">
          <LedgerHeading trailing={`${data.today.length} on the sheet`}>
            {data.todayHeading}
          </LedgerHeading>
          {data.today.length === 0 ? (
            <EmptyState
              className="mt-4 border-0 bg-transparent"
              title="Nothing on today's sheet"
              description="No confirmed or pending appointments for today. Yesterday's records stay in All appointments."
            />
          ) : (
            <Ledger>{renderRows(data.today)}</Ledger>
          )}

          <LedgerHeading
            trailing={`${data.tomorrow.length} booked`}
            className="mt-10"
          >
            {data.tomorrowHeading}
          </LedgerHeading>
          {data.tomorrow.length === 0 ? (
            <EmptyState
              className="mt-4 border-0 bg-transparent"
              title="Tomorrow is clear"
              description="Nothing booked for tomorrow yet."
            />
          ) : (
            <Ledger>{renderRows(data.tomorrow, data.today.length)}</Ledger>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Records from earlier dates are in{" "}
        <Link
          href="/receptionist/appointments"
          className="text-primary underline underline-offset-2"
        >
          All appointments
        </Link>
        . Attendance is marked there once the day has passed.{" "}
        <span className="figure">{formatDateShort(data.todayIso)}</span>
      </p>
    </div>
  );
}
