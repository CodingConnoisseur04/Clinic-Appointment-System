"use client";

import { useState } from "react";
import { toast } from "sonner";
import { confirmAppointment, rejectAppointment } from "@/lib/booking/update-appointment";
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
import { useAppointments } from "@/hooks/use-appointments";
import { formatTime12h } from "@/lib/utils";

export default function PendingPage() {
  const { appointments, loading, refresh, supabase } = useAppointments();
  const [confirmTarget, setConfirmTarget] = useState<(typeof appointments)[0] | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"cash" | "gcash">("cash");
  const [confirmRef, setConfirmRef] = useState("");
  const [rejectTarget, setRejectTarget] = useState<(typeof appointments)[0] | null>(null);

  const pendingRequests = appointments.filter(
    (a) => a.status === "PENDING" && a.source === "online"
  );

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
          Pending Requests
        </h1>
      </header>

      <Card className="shadow-warm">
        <CardHeader>
          <CardTitle>Pending online requests</CardTitle>
          <CardDescription>
            Confirm (with payment) or reject each request. An SMS is sent
            automatically after confirming.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending online requests.
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.appointment_date}</TableCell>
                      <TableCell>{formatTime12h(row.appointment_time)}</TableCell>
                      <TableCell>{row.patients?.full_name}</TableCell>
                      <TableCell>{row.patients?.phone}</TableCell>
                      <TableCell>{row.reason ?? "—"}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button size="sm" onClick={() => setConfirmTarget(row)}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejectTarget(row)}
                        >
                          Reject
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

      {/* Confirm dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm request</DialogTitle>
            <DialogDescription>
              Log payment, then confirm. A confirmation SMS is sent to the
              patient automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Payment method</Label>
              <Select
                value={confirmMethod}
                onValueChange={(v) => setConfirmMethod(v as "cash" | "gcash")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="confirm-ref">Payment reference</Label>
              <Input
                id="confirm-ref"
                value={confirmRef}
                onChange={(e) => setConfirmRef(e.target.value)}
                placeholder="e.g. receipt # / GCash ref"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!confirmTarget) return;
                const target = confirmTarget;
                setConfirmTarget(null);
                const confirmed = await act(
                  () =>
                    confirmAppointment(supabase, {
                      appointmentId: target.id,
                      paymentMethod: confirmMethod,
                      paymentReference: confirmRef || undefined,
                    }),
                  "Request confirmed."
                );
                setConfirmRef("");
                if (confirmed) {
                  const res = await fetch("/api/sms/send-confirmation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ appointmentId: target.id }),
                  });
                  const sms = await res.json();
                  if (res.ok && sms.delivered) {
                    toast.success("Confirmation SMS sent.");
                  } else {
                    toast.error("SMS failed to send (logged).");
                  }
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel appointment?</DialogTitle>
            <DialogDescription>
              This sets the appointment to CANCELLED and frees the slot.
              The patient is not notified automatically.
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
    </div>
  );
}
