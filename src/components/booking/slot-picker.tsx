"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

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
}: {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  selected: string | null;
  onSelect: (time: string) => void;
  refreshKey?: number;
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
          toast.error("Failed to load available slots");
        }
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, refreshKey]);

  const slots = date ? slotsData : [];

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar mode="single" selected={date} onSelect={onDateChange} />
      {date && <p className="text-sm font-medium">{toDateInput(date)}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading slots…</p>
      )}
      {!loading && date && slots.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No open slots this day (closed or fully booked).
        </p>
      )}
      {!loading && slots.length > 0 && (
        <div className="flex max-h-48 flex-wrap justify-center gap-1 overflow-y-auto">
          {slots.map((time) => (
            <Button
              key={time}
              size="sm"
              variant={selected === time ? "default" : "outline"}
              onClick={() => onSelect(time)}
            >
              {time}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export { toDateInput };
