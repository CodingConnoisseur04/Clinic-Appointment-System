"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSchedule, type ScheduleEntry } from "@/lib/schedule/get-schedule";
import { Button } from "@/components/ui/button";
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
import { formatTime12h } from "@/lib/utils";

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateInput(new Date());
}

export default function SchedulePage() {
  const supabase = createClient();
  const [range, setRange] = useState<"today" | "week">("today");
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  function weekBounds(): { from: string; to: string } {
    const now = new Date();
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: toDateInput(monday), to: toDateInput(sunday) };
  }

  const fetchSchedule = useCallback(async () => {
    const r = range === "today" ? { from: todayStr(), to: todayStr() } : weekBounds();
    return getSchedule(supabase, r);
  }, [supabase, range]);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule().then((rows) => {
      if (!cancelled) {
        setSchedule(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [fetchSchedule]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Confirmed appointments</CardTitle>
              <CardDescription>
                Read-only view. Attendance and cancellations are handled at the front desk.
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant={range === "today" ? "default" : "outline"}
                onClick={() => setRange("today")}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant={range === "week" ? "default" : "outline"}
                onClick={() => setRange("week")}
              >
                This Week
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No confirmed appointments in this range.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.appointment_date}</TableCell>
                      <TableCell>{formatTime12h(row.appointment_time)}</TableCell>
                      <TableCell>{row.patients?.full_name}</TableCell>
                      <TableCell>{row.patients?.phone}</TableCell>
                      <TableCell>{row.reason ?? "—"}</TableCell>
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
