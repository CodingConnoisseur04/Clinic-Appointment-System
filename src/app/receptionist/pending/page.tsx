"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  confirmAppointment,
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
import { useAppointments } from "@/hooks/use-appointments";
import {
  formatDateLong,
  formatDateShort,
  formatTime12h,
  relativeDayLabel,
} from "@/lib/utils";
import { PageMasthead } from "@/components/console/page-masthead";
import { EmptyState } from "@/components/console/empty-state";
import { StatusMark } from "@/components/console/status-mark";
import { Phone, Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type SmsOutcome = { delivered: boolean; name: string } | null;

export default function PendingPage() {
  const { appointments, loading, refresh, supabase } = useAppointments();
  const [confirmTarget, setConfirmTarget] = useState<(typeof appointments)[0] | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"cash" | "gcash">("cash");
  const [confirmRef, setConfirmRef] = useState("");
  const [rejectTarget, setRejectTarget] = useState<(typeof appointments)[0] | null>(null);
  const [smsOutcome, setSmsOutcome] = useState<SmsOutcome>(null);

  const pendingRequests = appointments
    .filter((a) => a.status === "PENDING" && a.source === "online")
    .sort((a, b) =>
      a.appointment_date === b.appointment_date
        ? a.appointment_time.localeCompare(b.appointment_time)
        : a.appointment_date.localeCompare(b.appointment_date)
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
      <PageMasthead
        meta="Front desk"
        title="Requests to action"
        lead="Online requests wait here until you decide. Confirm one once payment is arranged — confirming sets it to Confirmed and texts the patient. Cancelling frees the slot."
      />

      {/*
        The SMS result is shown on the page, not only in a toast. A notification
        that failed has to be visible after the toast is gone.
      */}
      {smsOutcome && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
            smsOutcome.delivered
              ? "border-primary/35 bg-primary/6"
              : "border-[var(--destructive)]/40 bg-[var(--destructive)]/6"
          )}
        >
          {smsOutcome.delivered ? (
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-[var(--destructive)]"
              aria-hidden="true"
            />
          )}
          <p className="text-pretty">
            {smsOutcome.delivered ? (
              <>Confirmation SMS delivered to {smsOutcome.name}.</>
            ) : (
              <>
                Confirmed, but the confirmation SMS failed for{" "}
                {smsOutcome.name} — the failure is logged. Call them instead.
              </>
            )}
          </p>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : pendingRequests.length === 0 ? (
        <EmptyState
          title="No requests waiting"
          description="Every online request has been dealt with. New ones land here the moment a patient submits them."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pendingRequests.map((row) => (
            <Card key={row.id} className="overflow-hidden">
              <CardContent className="flex flex-col gap-4 pt-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                  <div className="shrink-0">
                    <p className="text-meta text-muted-foreground uppercase">
                      Requested for
                    </p>
                    <p className="font-heading mt-1 text-xl leading-tight">
                      {relativeDayLabel(row.appointment_date)}
                    </p>
                    <p className="figure mt-0.5 text-data text-muted-foreground">
                      {formatTime12h(row.appointment_time)} ·{" "}
                      {formatDateShort(row.appointment_date)}
                    </p>
                  </div>

                  <div className="min-w-0 border-border sm:border-l sm:pl-6">
                    <p className="text-meta text-muted-foreground uppercase">
                      Patient
                    </p>
                    <p className="mt-1 font-medium">
                      {row.patients?.full_name ?? "Unknown patient"}
                    </p>
                    {row.patients?.phone && (
                      <a
                        href={`tel:${row.patients.phone}`}
                        className="figure mt-1 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                      >
                        <Phone className="size-3.5" aria-hidden="true" />
                        {row.patients.phone}
                      </a>
                    )}
                    {row.reason && (
                      <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">
                        “{row.reason}”
                      </p>
                    )}
                    {row.created_at && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sent{" "}
                        <span className="figure">
                          {format(new Date(row.created_at), "d MMM, h:mm a")}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-stretch">
                  <StatusMark status={row.status} className="lg:hidden" />
                  <Button
                    size="sm"
                    onClick={() => {
                      setConfirmMethod("cash");
                      setConfirmRef("");
                      setConfirmTarget(row);
                    }}
                    className="h-9 flex-1 px-3.5 lg:flex-none"
                  >
                    Confirm &amp; log payment
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setRejectTarget(row)}
                    className="h-9 flex-1 px-3.5 lg:flex-none"
                  >
                    Cancel request
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log payment and confirm</DialogTitle>
            <DialogDescription>
              {confirmTarget && (
                <>
                  {confirmTarget.patients?.full_name ?? "This patient"} ·{" "}
                  {formatDateLong(confirmTarget.appointment_date)} at{" "}
                  {formatTime12h(confirmTarget.appointment_time)}. Confirming
                  texts them a confirmation message.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-ref">Payment reference</Label>
              <Input
                id="confirm-ref"
                value={confirmRef}
                onChange={(e) => setConfirmRef(e.target.value)}
                placeholder="Receipt number, or GCash reference"
              />
              <p className="text-xs text-muted-foreground">
                Optional, but this is the only record that payment was taken.
              </p>
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
                const name = target.patients?.full_name ?? "the patient";
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
                  setSmsOutcome({ delivered: Boolean(res.ok && sms.delivered), name });
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
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>
              This sets the appointment to Cancelled and frees the slot for
              someone else. The patient is not texted automatically — call them.
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
                  "Request cancelled."
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
