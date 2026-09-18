import { clsx, type ClassValue } from "clsx"
import { format } from "date-fns"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Canonical PH mobile format: 09XXXXXXXXX (11 digits, digits only).
 * Accepts +63 / 63 / a missing leading 0, plus any spacing or dashes:
 * "+63 917 123 4567", "0917-123-4567" and "9171234567" all become
 * "09171234567". Returns null for anything that is not a PH mobile number —
 * landlines, foreign numbers, too few or too many digits.
 *
 * Used everywhere a phone number enters the system (patient identity and SMS
 * sending) so one person keeps exactly one patient record and Semaphore
 * receives a clean number.
 */
export function normalizePhMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("639")) local = `0${local.slice(2)}`;
  else if (local.length === 10 && local.startsWith("9")) local = `0${local}`;
  return /^09\d{9}$/.test(local) ? local : null;
}

/** Convert a 24h time string like "14:30" to "2:30 PM". */
export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "₱500" / "₱1,250.50" — the one peso formatter, used everywhere a fee prints. */
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

/*
 * Dates arrive from Postgres as plain "YYYY-MM-DD". Parsing them with
 * `new Date("2026-09-11")` reads them as UTC midnight and can render the
 * previous day west of Greenwich, so they are always rebuilt from parts as a
 * local date before display.
 */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** "Fri 11 Sep" — for tables and dense records. */
export function formatDateShort(iso: string): string {
  return format(parseDateOnly(iso), "EEE d MMM")
}

/** "Friday 11 September 2026" — for a record's own detail line. */
export function formatDateLong(iso: string): string {
  return format(parseDateOnly(iso), "EEEE d MMMM yyyy")
}

/** "Friday 11 September" — the day heading of a ledger group. */
export function formatDayHeading(iso: string): string {
  return format(parseDateOnly(iso), "EEEE d MMMM")
}

/** Ledger day-group heading: "Today", or just the full date. Never both —
 *  the relative word and the long date carry the same information. */
export function dayGroupHeading(iso: string): string {
  const label = relativeDayLabel(iso)
  return label === formatDateShort(iso) ? label : formatDayHeading(iso)
}

/** Today as "YYYY-MM-DD" in the viewer's own timezone. */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

/** Shift an ISO date-only string by whole days, keeping it in local time. */
export function addDaysIso(iso: string, days: number): string {
  const d = parseDateOnly(iso)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`
}

/** "Today" / "Tomorrow" / "Yesterday" / "Fri 11 Sep". */
export function relativeDayLabel(iso: string): string {
  const today = todayIso()
  if (iso === today) return "Today"
  if (iso === addDaysIso(today, 1)) return "Tomorrow"
  if (iso === addDaysIso(today, -1)) return "Yesterday"
  return formatDateShort(iso)
}
