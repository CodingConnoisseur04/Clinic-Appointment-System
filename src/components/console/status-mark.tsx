import { cn } from "@/lib/utils";

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED";
export type AttendanceValue = "ATTENDED" | "NO_SHOW" | null;

/*
 * A state is written down as an inked mark, the way it is on a paper
 * appointment book — not as a rounded pill. Gold is reserved for the one
 * state that is waiting on a human: PENDING. That is gold's job everywhere.
 */
const STATUS: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING: { label: "Awaiting action", className: "mark-pending" },
  CONFIRMED: { label: "Confirmed", className: "mark-confirmed" },
  CANCELLED: { label: "Cancelled", className: "mark-cancelled" },
};

const ATTENDANCE: Record<"ATTENDED" | "NO_SHOW", { label: string; className: string }> = {
  ATTENDED: { label: "Attended", className: "mark-attended" },
  NO_SHOW: { label: "No-show", className: "mark-noshow" },
};

export function StatusMark({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  const { label, className: tone } = STATUS[status];
  return <span className={cn("mark", tone, className)}>{label}</span>;
}

export function AttendanceMark({
  attendance,
  className,
}: {
  attendance: AttendanceValue;
  className?: string;
}) {
  if (!attendance) {
    return <span className={cn("mark mark-none", className)}>Not marked</span>;
  }
  const { label, className: tone } = ATTENDANCE[attendance];
  return <span className={cn("mark", tone, className)}>{label}</span>;
}

/* Where the booking came from. Deliberately quiet — it is context, not state. */
export function SourceTag({ source }: { source: "online" | "walk_in" }) {
  return (
    <span className="text-meta text-muted-foreground uppercase">
      {source === "online" ? "Online request" : "Walk-in"}
    </span>
  );
}
