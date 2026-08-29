"use client";

import { useState } from "react";
import { toast } from "sonner";
import { markAttendance, rejectAppointment } from "@/lib/booking/update-appointment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useAppointments, todayStr } from "@/hooks/use-appointments";
import { formatTime12h } from "@/lib/utils";

export default function AppointmentsPage() {
  const { appointments, loading, refresh, supabase } = useAppointments();
  const [statusFilter, setStatusFilter] = useState<"all" | "PENDING" | "CONFIRMED" | "CANCELLED">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [rejectTarget, setRejectTarget] = useState<(typeof appointments)[0] | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<{
    row: (typeof appointments)[0];
    mark: "ATTENDED" | "NO_SHOW";
  } | null>(null);

  const filtered = appointments.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (dateFilter && a.appointment_date !== dateFilter) return false;
    return true;
  });

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
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          All Appointments
        </h1>
      </header>

      <Card className="shadow-warm">
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
          <CardDescription>
            Mark attendance once dates pass; cancel to free the slot.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label>Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
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
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No appointments match the filters.
            </p>
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const pastOrToday = row.appointment_date <= todayStr();
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.appointment_date}</TableCell>
                        <TableCell>{formatTime12h(row.appointment_time)}</TableCell>
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
                        <TableCell>
                          {row.attendance ? (
                            <Badge variant="default">Completed</Badge>
                          ) : row.status === "CONFIRMED" && pastOrToday ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAttendanceTarget({ row, mark: "ATTENDED" })
                                }
                              >
                                Attended
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setAttendanceTarget({ row, mark: "NO_SHOW" })
                                }
                              >
                                No-show
                              </Button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status !== "CANCELLED" && !row.attendance && (
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment?</DialogTitle>
            <DialogDescription>
              This sets the appointment to CANCELLED and frees the slot.
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
              {attendanceTarget?.row.patients?.full_name} —{" "}
              {attendanceTarget?.row.appointment_date}{" "}
              {formatTime12h(attendanceTarget?.row.appointment_time ?? "")}
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
