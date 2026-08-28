"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { updateWorkingHours } from "@/lib/availability/update-hours";
import {
  addException,
  removeException,
} from "@/lib/availability/manage-exceptions";
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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateInput(new Date());
}

export default function AvailabilityPage() {
  const supabase = createClient();
  const [hours, setHours] = useState<AvailabilityRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [edits, setEdits] = useState<
    Record<string, { startTime: string; endTime: string; isActive: boolean }>
  >({});

  const [excDate, setExcDate] = useState("");
  const [excReason, setExcReason] = useState("");

  const fetchAvailability = useCallback(async () => {
    const [{ data: h }, { data: e }] = await Promise.all([
      supabase.from("doctor_availability").select("*").order("day_of_week"),
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

  const refresh = useCallback(async () => {
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
    return () => { cancelled = true; };
  }, [fetchAvailability]);

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
          `Saved — ${result.conflictingAppointments} confirmed appointment(s) now fall outside these hours.`
        );
      } else {
        toast.success("Working hours saved.");
      }
      await refresh();
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
          `${result.conflictingAppointments} confirmed appointment(s) fall on this date.`
        );
      } else {
        toast.success(`${excDate} marked closed.`);
      }
      setExcDate("");
      setExcReason("");
      await refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function deleteException(row: ExceptionRow) {
    const result = await removeException(supabase, { id: row.id });
    if (result.success) {
      toast.success(`${row.exception_date} reopened.`);
      await refresh();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Availability</h1>
      </header>

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
            One-off whole-day closures. Booking forms stop offering slots on closed dates.
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
            <p className="text-sm text-muted-foreground">No upcoming closures.</p>
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
    </div>
  );
}
