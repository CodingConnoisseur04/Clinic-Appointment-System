"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getClinicSettings, type ClinicSettings } from "@/lib/clinic-settings";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardList, Phone } from "lucide-react";
import { formatTime12h } from "@/lib/utils";

type Appointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  source: "online" | "walk_in";
  reason: string | null;
  patients: { full_name: string; phone: string } | null;
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DateSection({
  label,
  appointments,
}: {
  label: string;
  appointments: Appointment[];
}) {
  if (appointments.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted-foreground" style={{ textWrap: "balance" }}>{label}</h3>
        <p className="text-sm text-muted-foreground">No appointments.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {appointments.map((appt) => (
          <Card key={appt.id}>
            <CardContent className="flex flex-col gap-1.5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {appt.patients?.full_name ?? "Unknown"}
                </span>
                <Badge
                  variant={
                    appt.status === "CONFIRMED"
                      ? "default"
                      : appt.status === "PENDING"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {appt.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatTime12h(appt.appointment_time)}</span>
                <span>·</span>
                <span className="capitalize">
                  {appt.source === "online" ? "Online" : "Walk-in"}
                </span>
              </div>
              {appt.reason && (
                <p className="text-xs text-muted-foreground truncate">
                  {appt.reason}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ReceptionistHomePage() {
  const supabase = createClient();
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [tomorrowAppts, setTomorrowAppts] = useState<Appointment[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const today = todayStr();
      const tomorrow = tomorrowStr();

      const [apptsResult, pendingResult, settingsResult] = await Promise.all([
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
        getClinicSettings(supabase),
      ]);

      if (cancelled) return;

      const all = (apptsResult.data ?? []) as unknown as Appointment[];
      setTodayAppts(all.filter((a) => a.appointment_date === today));
      setTomorrowAppts(all.filter((a) => a.appointment_date === tomorrow));
      setPendingCount(pendingResult.count ?? 0);
      setSettings(settingsResult);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        </header>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      </header>

      {/* Quick stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardList className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">
                Pending Requests
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="size-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">Receptionist contact</p>
              <p className="text-xs text-muted-foreground">
                {settings?.receptionist_phone ?? "(088) 000-0000"}
              </p>
            </div>
          </CardContent>
        </Card>

        {pendingCount > 0 && (
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">
                  {pendingCount} request{pendingCount !== 1 ? "s" : ""} need
                  action
                </p>
                <p className="text-xs text-muted-foreground">
                  Confirm or reject online booking requests
                </p>
              </div>
              <Link
                href="/receptionist/pending"
                className={cn(buttonVariants({ variant: "default", size: "sm" }))}
              >
                Review
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Upcoming appointments */}
      <div className="flex flex-col gap-6">
        <DateSection label="Today" appointments={todayAppts} />
        <DateSection label="Tomorrow" appointments={tomorrowAppts} />
      </div>
    </div>
  );
}
