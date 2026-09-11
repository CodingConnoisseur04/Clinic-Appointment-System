"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTime12h } from "@/lib/utils";

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Shared date -> available-slots picker used by the patient booking form and
// the receptionist walk-in form. Fetches Phase 3's /api/available-slots
// itself; bump `refreshKey` to re-fetch after a SLOT_TAKEN result.
export function SlotPicker({
  date,
  onDateChange,
  selected,
  onSelect,
  refreshKey = 0,
  showCalendar = true,
}: {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  selected: string | null;
  onSelect: (time: string) => void;
  refreshKey?: number;
  showCalendar?: boolean;
}) {
  const [slotsData, setSlotsData] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    // Deferred one tick so state updates never fire synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/available-slots?date=${toDateInput(date)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (!cancelled) {
          setSlotsData((body.slots ?? []).map((s: { time: string }) => s.time));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSlotsData([]);
          setLoading(false);
          toast.error("Could not load times for that day.");
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, refreshKey]);

  // Filter out past time slots when the selected date is today.
  const now = new Date();
  const isToday =
    date !== undefined &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slots = date
    ? isToday
      ? slotsData.filter((t) => {
          const [h, m] = t.split(":").map(Number);
          return h * 60 + m > currentMinutes;
        })
      : slotsData
    : [];

  return (
    <div className="flex flex-col gap-4">
      {showCalendar && (
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          disabled={{ before: new Date() }}
          className="mx-auto"
        />
      )}

      {!date && (
        <p className="text-sm text-muted-foreground">
          Pick a day to see the times that are open.
        </p>
      )}

      {date && (
        <div className="flex flex-col gap-3">
          <p className="text-meta text-muted-foreground uppercase">
            {format(date, "EEEE d MMMM")}
          </p>

          {loading && (
            <div className="grid grid-cols-3 gap-2" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          )}

          {!loading && slots.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No times open this day — the clinic is closed, or every slot is
              already taken. Try another day.
            </p>
          )}

          {!loading && slots.length > 0 && (
            <>
              <div
                role="group"
                aria-label="Open times"
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3"
              >
                {slots.map((time) => {
                  const active = selected === time;
                  return (
                    <Button
                      key={time}
                      type="button"
                      variant="outline"
                      aria-pressed={active}
                      onClick={() => onSelect(time)}
                      className={cn(
                        "figure h-10 justify-center px-2 text-sm",
                        active &&
                          "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                      )}
                    >
                      {formatTime12h(time)}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-pretty text-muted-foreground">
                These times were open a moment ago. Submitting holds your time
                while the front desk reviews it — if someone was already ahead
                of you, we&apos;ll ask you to pick another.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { toDateInput };
