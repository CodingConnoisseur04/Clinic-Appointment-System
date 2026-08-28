"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getSchedule, type ScheduleEntry } from "@/lib/schedule/get-schedule";
import { updateWorkingHours } from "@/lib/availability/update-hours";
import {
  addException,
  removeException,
} from "@/lib/availability/manage-exceptions";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AvailabilityRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

type ExceptionRow = {
  id: string;
  exception_date: string;
  reason: string | null;
};

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateInput(new Date());
}

export default function DoctorPage() {
  const supabase = createClient();

  const [range, setRange] = useState<"today" | "week">("today");
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const [hours, setHours] = useState<AvailabilityRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);

  // Editable copies of hours rows, keyed by row id.
  const [edits, setEdits] = useState<
    Record<string, { startTime: string; endTime: string; isActive: boolean }>
  >({});

  const [excDate, setExcDate] = useState("");
  const [excReason, setExcReason] = useState("");

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
    const r =
      range === "today"
        ? { from: todayStr(), to: todayStr() }
        : weekBounds();
    return getSchedule(supabase, r);
  }, [supabase, range]);

  const fetchAvailability = useCallback(async () => {
    const [{ data: h }, { data: e }] = await Promise.all([
      supabase
        .from("doctor_availability")
        .select("*")
        .order("day_of_week"),
      supabase
        .from("availability_exceptions")
        .select("*")
        .gte("exception_date", todayStr())
        .order("exception_date"),
    ]);
    return {
      hours: (h ?? []) as AvailabilityRow[],
      exceptions: (e ?? []) as ExceptionRow[],
    };
  }, [supabase]);

  const refreshAvailability = useCallback(async () => {
    const { hours, exceptions } = await fetchAvailability();
    setHours(hours);
    setExceptions(exceptions);
    setEdits(
      Object.fromEntries(
        hours.map((row) => [
          row.id,
          {
            startTime: row.start_time.slice(0, 5),
            endTime: row.end_time.slice(0, 5),
            isActive: row.is_active,
          },
        ])
      )
    );
  }, [fetchAvailability]);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule().then((rows) => {
      if (!cancelled) {
        setSchedule(rows);
        setLoadingSchedule(false);
      }
    });
    fetchAvailability().then(({ hours, exceptions }) => {
      if (cancelled) return;
      setHours(hours);
      setExceptions(exceptions);
      setEdits(
        Object.fromEntries(
          hours.map((row) => [
            row.id,
            {
              startTime: row.start_time.slice(0, 5),
              endTime: row.end_time.slice(0, 5),
              isActive: row.is_active,
            },
          ])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [fetchSchedule, fetchAvailability]);

  function editFor(id: string) {
    return edits[id] ?? { startTime: "", endTime: "", isActive: false };
  }

  async function saveHours(row: AvailabilityRow) {
    const e = editFor(row.id);
    const result = await updateWorkingHours(supabase, {
      id: row.id,
      startTime: e.startTime,
      endTime: e.endTime,
      isActive: e.isActive,
    });
    if (result.success) {
      if (result.conflictingAppointments > 0) {
        toast.warning(
          `Saved — ${result.conflictingAppointments} confirmed appointment(s) now fall outside these hours and won't be cancelled automatically. Check the schedule.`
        );
      } else {
        toast.success("Working hours saved.");
      }
      await refreshAvailability();
    } else {
      toast.error(result.message);
    }
  }

  async function submitException() {
    if (!excDate) {
      toast.error("Pick a date to close.");
      return;
    }
    const result = await addException(supabase, {
      date: excDate,
      reason: excReason || undefined,
    });
    if (result.success) {
      if (result.conflictingAppointments > 0) {
        toast.warning(
          `${result.conflictingAppointments} confirmed appointment(s) fall on this date — closing it won't cancel them automatically, check the schedule tab.`
        );
      } else {
        toast.success(`${excDate} marked closed.`);
      }
      setExcDate("");
      setExcReason("");
      await refreshAvailability();
    } else {
      toast.error(result.message);
    }
  }

  async function deleteException(row: ExceptionRow) {
    const result = await removeException(supabase, { id: row.id });
    if (result.success) {
      toast.success(`${row.exception_date} reopened.`);
      await refreshAvailability();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex flex-col flex-1 gap-6 bg-zinc-50 p-6 dark:bg-black">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Doctor Dashboard</h1>
        <Badge variant="outline">Clinician</Badge>
      </header>

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="availability">Manage Availability</TabsTrigger>
        </TabsList>

        {/* ---- Tab 1: Schedule (read-only) ---- */}
        <TabsContent value="schedule" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Confirmed appointments</CardTitle>
                  <CardDescription>
                    Read-only view. Attendance and cancellations are handled at
                    the front desk.
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
              {loadingSchedule ? (
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
                        <TableCell>{row.appointment_time.slice(0, 5)}</TableCell>
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
        </TabsContent>

        {/* ---- Tab 2: Manage Availability ---- */}
        <TabsContent value="availability" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly working hours</CardTitle>
              <CardDescription>
                Edit inline and save per row. Saving warns you if confirmed
                appointments now fall outside your hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="-mx-2 overflow-x-auto px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hours.map((row) => {
                    const e = editFor(row.id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{DAYS[row.day_of_week]}</TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            className="w-28"
                            value={e.startTime}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], startTime: ev.target.value },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="time"
                            className="w-28"
                            value={e.endTime}
                            onChange={(ev) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], endTime: ev.target.value },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={e.isActive}
                            onCheckedChange={(v) =>
                              setEdits((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], isActive: v },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => saveHours(row)}>
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Closed dates</CardTitle>
              <CardDescription>
                One-off whole-day closures. Booking forms stop offering slots
                on closed dates immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="exc-date">Date</Label>
                  <Input
                    id="exc-date"
                    type="date"
                    className="w-44"
                    value={excDate}
                    onChange={(e) => setExcDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <Label htmlFor="exc-reason">Reason (optional)</Label>
                  <Input
                    id="exc-reason"
                    placeholder="Conference, sick day…"
                    value={excReason}
                    onChange={(e) => setExcReason(e.target.value)}
                  />
                </div>
                <Button onClick={submitException}>Close date</Button>
              </div>

              {exceptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No upcoming closures.
                </p>
              ) : (
                <div className="-mx-2 overflow-x-auto px-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exceptions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.exception_date}</TableCell>
                        <TableCell>{row.reason ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteException(row)}
                          >
                            Reopen
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
