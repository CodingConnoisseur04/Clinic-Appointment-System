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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateLong, relativeDayLabel, todayIso } from "@/lib/utils";
import { PageMasthead } from "@/components/console/page-masthead";
import { EmptyState } from "@/components/console/empty-state";
import { LedgerHeading } from "@/components/console/ledger";
import { cn } from "@/lib/utils";

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

export default function AvailabilityPage() {
  const supabase = createClient();
  const [hours, setHours] = useState<AvailabilityRow[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [edits, setEdits] = useState<
    Record<string, { startTime: string; endTime: string; isActive: boolean }>
  >({});
  const [loading, setLoading] = useState(true);

  const [excDate, setExcDate] = useState("");
  const [excReason, setExcReason] = useState("");

  const fetchAvailability = useCallback(async () => {
    const [{ data: h }, { data: e }] = await Promise.all([
      supabase.from("doctor_availability").select("*").order("day_of_week"),
      supabase
        .from("availability_exceptions")
        .select("*")
        .gte("exception_date", todayIso())
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
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchAvailability]);

  function editFor(id: string) {
    return edits[id] ?? { startTime: "", endTime: "", isActive: false };
  }

  function patch(id: string, fields: Partial<{ startTime: string; endTime: string; isActive: boolean }>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...fields } }));
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
          `Saved. ${result.conflictingAppointments} confirmed appointment(s) now fall outside these hours.`
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

  const activeDays = hours.filter((h) => h.is_active).length;

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Consulting room"
        title="Working hours"
        lead="These hours are what generate the times patients can request. Save a row and you are warned immediately if a confirmed appointment now falls outside it."
      />

      <Card>
        <CardHeader>
          <CardTitle>Weekly working hours</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <LedgerHeading trailing={`${activeDays} of 7 days open`}>
                Hours
              </LedgerHeading>
              <ul>
                {hours.map((row, i) => {
                  const e = editFor(row.id);
                  return (
                    <li
                      key={row.id}
                      className="ink-in grid items-center gap-x-4 gap-y-3 border-b border-border py-3 last:border-b-0 sm:grid-cols-[9rem_auto_auto_1fr_auto]"
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 rounded-full",
                            e.isActive ? "bg-[var(--primary)]" : "bg-border"
                          )}
                        />
                        <span
                          className={cn(
                            "text-section text-sm",
                            e.isActive ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {DAYS[row.day_of_week]}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          aria-label={`${DAYS[row.day_of_week]} start time`}
                          className="figure w-28"
                          value={e.startTime}
                          onChange={(ev) => patch(row.id, { startTime: ev.target.value })}
                        />
                        <span aria-hidden className="text-muted-foreground">
                          –
                        </span>
                        <Input
                          type="time"
                          aria-label={`${DAYS[row.day_of_week]} end time`}
                          className="figure w-28"
                          value={e.endTime}
                          onChange={(ev) => patch(row.id, { endTime: ev.target.value })}
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={e.isActive}
                          aria-label={`${DAYS[row.day_of_week]} open`}
                          onCheckedChange={(v) => patch(row.id, { isActive: v })}
                        />
                        {e.isActive ? "Open" : "Closed"}
                      </label>

                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {row.slot_duration_minutes} min per appointment
                      </span>

                      <Button size="sm" className="justify-self-start" onClick={() => saveHours(row)}>
                        Save
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Days the clinic is closed</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exc-date">Date to close</Label>
              <Input
                id="exc-date"
                type="date"
                className="w-44"
                value={excDate}
                onChange={(e) => setExcDate(e.target.value)}
              />
            </div>
            <div className="flex min-w-52 flex-1 flex-col gap-1.5">
              <Label htmlFor="exc-reason">Reason (optional)</Label>
              <Input
                id="exc-reason"
                placeholder="Conference, sick day, holiday…"
                value={excReason}
                onChange={(e) => setExcReason(e.target.value)}
              />
            </div>
            <Button onClick={submitException}>Close that day</Button>
          </div>

          <div>
            <LedgerHeading trailing={`${exceptions.length} upcoming`}>
              Upcoming closures
            </LedgerHeading>
            {exceptions.length === 0 ? (
              <EmptyState
                className="mt-4 border-0 bg-transparent"
                title="No closed days coming up"
                description="The clinic follows its weekly hours until you close a specific date here."
              />
            ) : (
              <ul>
                {exceptions.map((row, i) => (
                  <li
                    key={row.id}
                    className="ink-in grid items-center gap-3 border-b border-border py-3 last:border-b-0 sm:grid-cols-[1fr_auto]"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div>
                      <p className="figure text-sm">{formatDateLong(row.exception_date)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {relativeDayLabel(row.exception_date)}
                        {row.reason ? ` · ${row.reason}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteException(row)}
                    >
                      Reopen
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
