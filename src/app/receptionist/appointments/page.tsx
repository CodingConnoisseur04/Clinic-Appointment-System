"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  markAttendance,
  rejectAppointment,
} from "@/lib/booking/update-appointment";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAppointments, type AppointmentRow } from "@/hooks/use-appointments";
import {
  dayGroupHeading,
  formatDateLong,
  formatTime12h,
  todayIso,
} from "@/lib/utils";
import {
  PageMasthead,
  MastheadStats,
} from "@/components/console/page-masthead";
import { EmptyState } from "@/components/console/empty-state";
import {
  AttendanceMark,
  SourceTag,
  StatusMark,
} from "@/components/console/status-mark";
import { LedgerHeading } from "@/components/console/ledger";

export default function AppointmentsPage() {
  const { appointments, loading, refresh, supabase } = useAppointments();
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "CONFIRMED" | "CANCELLED">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AppointmentRow | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<{
    row: AppointmentRow;
    mark: "ATTENDED" | "NO_SHOW";
  } | null>(null);

  const today = todayIso();

  const filtered = appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (dateFilter && a.appointment_date !== dateFilter) return false;
    return true;
  });

  /* Grouped by day, newest first: a ledger is easier to read by day than by
     a repeating Date column. */
  const grouped = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const row of filtered) {
      const list = map.get(row.appointment_date) ?? [];
      list.push(row);
      map.set(row.appointment_date, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, rows]) => ({
        date,
        rows: rows.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)),
      }));
  }, [filtered]);

  const needsMarking = appointments.filter(
    (a) => a.status === "CONFIRMED" && !a.attendance && a.appointment_date <= today
  ).length;

  async function act(fn: () => Promise<{ success: boolean; message?: string }>, okMsg: string) {
    const result = await fn();
    if (result.success) {
      toast.success(okMsg);
      await refresh();
    } else {
      toast.error(result.message ?? "Action failed");
    }
    return result.success;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Records"
        title="All appointments"
        lead="Every appointment, online or at the desk, kept for good. Cancelling marks a record, it never deletes one. Mark attendance after each day so the no-show report stays honest."
        actions={
          <a
            href="/receptionist/walk-in"
            className="inline-flex h-9 items-center rounded-lg bg-field-foreground px-3.5 text-sm font-medium text-field hover:bg-field-foreground/88"
          >
            Register a walk-in
          </a>
        }
      >
        {!loading && (
          <MastheadStats
            stats={[
              { label: "In view", value: filtered.length },
              {
                label: "Awaiting action",
                value: appointments.filter((a) => a.status === "PENDING").length,
                tone:
                  appointments.some((a) => a.status === "PENDING") ? "gold" : "default",
              },
              {
                label: "Needs attendance",
                value: needsMarking,
                tone: needsMarking > 0 ? "gold" : "default",
              },
              { label: "Cancelled", value: appointments.filter((a) => a.status === "CANCELLED").length },
            ]}
          />
        )}
      </PageMasthead>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-warm">
        <div className="flex flex-col gap-1">
          <Label className="text-meta text-muted-foreground uppercase">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Awaiting action</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date" className="text-meta text-muted-foreground uppercase">
            One day only
          </Label>
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
            Clear day
          </Button>
        )}
        <p className="figure ml-auto text-xs text-muted-foreground">
          {filtered.length} of {appointments.length}
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-28" />
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              title="No appointments match"
              description="Nothing matches these filters. Widen the status filter, or clear the day."
              action={
                (statusFilter !== "all" || dateFilter) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatusFilter("all");
                      setDateFilter("");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            grouped.map(({ date, rows }) => (
              <section key={date}>
                <LedgerHeading trailing={`${rows.length} record${rows.length === 1 ? "" : "s"}`}>
                  {dayGroupHeading(date)}
                </LedgerHeading>
                <ol>
                  {rows.map((row, i) => {
                    const pastOrToday = row.appointment_date <= today;
                    return (
                      <li
                        key={row.id}
                        className="ledger-row ink-in"
                        style={{ "--i": i } as React.CSSProperties}
                      >
                        <div className="figure text-sm sm:text-data">
                          {formatTime12h(row.appointment_time)}
                        </div>

                        <div className="flex min-w-0 flex-col gap-1.5">
                          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            <span className="text-sm font-medium">
                              {row.patients?.full_name ?? "Unknown patient"}
                            </span>
                            <SourceTag source={row.source} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {row.reason && (
                              <span className="text-xs text-pretty text-muted-foreground">
                                {row.reason}
                              </span>
                            )}
                            {row.payment_method && (
                              <span className="text-xs text-muted-foreground">
                                Paid by {row.payment_method === "cash" ? "cash" : "GCash"}
                                {row.payment_reference && (
                                  <>
                                    {" · "}
                                    <span className="figure text-foreground">
                                      {row.payment_reference}
                                    </span>
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusMark status={row.status} />
                            {row.attendance && <AttendanceMark attendance={row.attendance} />}
                          </div>
                        </div>

                        <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:justify-end">
                          {!row.attendance &&
                            row.status === "CONFIRMED" &&
                            pastOrToday && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() =>
                                    setAttendanceTarget({ row, mark: "ATTENDED" })
                                  }
                                >
                                  Attended
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={() =>
                                    setAttendanceTarget({ row, mark: "NO_SHOW" })
                                  }
                                >
                                  No-show
                                </Button>
                              </>
                            )}
                          {row.status !== "CANCELLED" && !row.attendance && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8"
                              onClick={() => setRejectTarget(row)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))
          )}
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this appointment?</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  {rejectTarget.patients?.full_name ?? "This patient"} ·{" "}
                  {formatDateLong(rejectTarget.appointment_date)} at{" "}
                  {formatTime12h(rejectTarget.appointment_time)}. It is marked
                  Cancelled and the slot frees up. The record itself is kept, and
                  the patient is not texted automatically.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>
              Keep it
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

      {/* Attendance dialog */}
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
              {attendanceTarget ? (
                <>
                  {attendanceTarget.row.patients?.full_name ?? "This patient"} ·{" "}
                  {formatDateLong(attendanceTarget.row.appointment_date)} at{" "}
                  {formatTime12h(attendanceTarget.row.appointment_time)}.{" "}
                  {attendanceTarget.mark === "NO_SHOW"
                    ? "This counts against the clinic's no-show rate in Reports."
                    : "This records that the patient was seen."}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttendanceTarget(null)}>
              Not now
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
                  t.mark === "ATTENDED" ? "Marked attended." : "Marked no-show."
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
