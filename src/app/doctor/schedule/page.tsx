"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSchedule, type ScheduleEntry } from "@/lib/schedule/get-schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dayGroupHeading,
  formatTime12h,
  relativeDayLabel,
  todayIso,
} from "@/lib/utils";
import {
  PageMasthead,
  MastheadStats,
} from "@/components/console/page-masthead";
import { CLINIC } from "@/lib/brand";
import { EmptyState } from "@/components/console/empty-state";
import { LedgerHeading } from "@/components/console/ledger";
import { SeniorPwdMark } from "@/components/console/senior-pwd-mark";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SchedulePage() {
  const supabase = createClient();
  const [range, setRange] = useState<"today" | "week">("today");
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  function weekBounds(): { from: string; to: string } {
    const now = new Date();
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: toDateInput(monday), to: toDateInput(sunday) };
  }

  const fetchSchedule = useCallback(async () => {
    const r = range === "today" ? { from: todayIso(), to: todayIso() } : weekBounds();
    return getSchedule(supabase, r);
  }, [supabase, range]);

  useEffect(() => {
    let cancelled = false;
    fetchSchedule().then((rows) => {
      if (!cancelled) {
        setSchedule(rows);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [fetchSchedule]);

  const grouped = Object.entries(
    schedule.reduce<Record<string, ScheduleEntry[]>>((acc, row) => {
      (acc[row.appointment_date] ??= []).push(row);
      return acc;
    }, {})
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const todayCount = schedule.filter((r) => r.appointment_date === todayIso()).length;

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta={range === "today" ? relativeDayLabel(todayIso()) : "This week"}
        title="Your schedule"
        image={CLINIC.images.consult}
        lead="Confirmed appointments only, as a read-only agenda. Attendance, cancellations and payment are handled at the front desk."
        actions={
          <>
            <Button
              size="sm"
              className="h-9 px-3.5"
              variant={range === "today" ? "field" : "field-outline"}
              onClick={() => setRange("today")}
            >
              Today
            </Button>
            <Button
              size="sm"
              className="h-9 px-3.5"
              variant={range === "week" ? "field" : "field-outline"}
              onClick={() => setRange("week")}
            >
              This week
            </Button>
          </>
        }
      >
        {!loading && (
          <MastheadStats
            stats={[
              { label: "In this range", value: schedule.length },
              { label: "Today", value: todayCount },
              {
                label: "Days with clinic",
                value: grouped.length,
              },
              {
                label: "Reasons given",
                value: schedule.filter((r) => r.reason).length,
              },
            ]}
          />
        )}
      </PageMasthead>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <EmptyState
              title="Nothing confirmed in this range"
              description={
                range === "today"
                  ? "No confirmed appointments for today. Switch to This week to look ahead."
                  : "No confirmed appointments this week."
              }
              action={
                range === "today" && (
                  <Button variant="outline" size="sm" onClick={() => setRange("week")}>
                    Look at this week
                  </Button>
                )
              }
            />
          ) : (
            grouped.map(([date, rows], groupIndex) => (
              <section key={date}>
                <LedgerHeading
                  className={groupIndex === 0 ? undefined : "mt-8"}
                  trailing={`${rows.length} patient${rows.length === 1 ? "" : "s"}`}
                >
                  {dayGroupHeading(date)}
                </LedgerHeading>
                <ol>
                  {rows.map((row, i) => (
                    <li
                      key={row.id}
                      className="ledger-row ink-in"
                      style={{ "--i": i + groupIndex } as React.CSSProperties}
                    >
                      <div className="figure text-sm sm:text-data">
                        {formatTime12h(row.appointment_time)}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-sm font-medium">
                          {row.patients?.full_name ?? "Unknown patient"}
                          {row.patients?.is_senior_pwd === true && (
                            <SeniorPwdMark className="ml-2 align-middle" />
                          )}
                        </span>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {row.patients?.phone && (
                            <a
                              href={`tel:${row.patients.phone}`}
                              className="figure inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                            >
                              <Phone className="size-3" aria-hidden="true" />
                              {row.patients.phone}
                            </a>
                          )}
                          {row.reason && (
                            <span
                              className={cn(
                                "text-xs text-pretty text-muted-foreground",
                                "max-w-prose"
                              )}
                            >
                              {row.reason}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
