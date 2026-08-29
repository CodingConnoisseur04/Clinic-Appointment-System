"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { createClient } from "@/lib/supabase/client";
import {
  getNoShowReport,
  type NoShowReport,
} from "@/lib/reports/get-no-show-report";
import {
  getAppointmentSummary,
  type AppointmentSummary,
} from "@/lib/reports/get-appointment-summary";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toDateInput } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { downloadAppointmentCsv } from "@/lib/reports/download-csv";
import { Download } from "lucide-react";

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold">{value ?? "-"}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function ReportsPage() {
  const supabase = createClient();

  const [reportRange, setReportRange] = useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from, to };
  });
  const [noShow, setNoShow] = useState<NoShowReport>();
  const [summary, setSummary] = useState<AppointmentSummary>();
  const [downloading, setDownloading] = useState(false);

  const reportRangeStr = useMemo(() => {
    if (!reportRange?.from || !reportRange?.to) return null;
    return {
      from: toDateInput(reportRange.from),
      to: toDateInput(reportRange.to),
    };
  }, [reportRange]);

  useEffect(() => {
    if (!reportRangeStr) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [ns, sum] = await Promise.all([
        getNoShowReport(supabase, reportRangeStr),
        getAppointmentSummary(supabase, reportRangeStr),
      ]);
      if (!cancelled) {
        setNoShow(ns);
        setSummary(sum);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, reportRangeStr]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Date range</CardTitle>
            <CardDescription>
              Defaults to the last 30 days. Reports update on selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="range"
              selected={reportRange}
              onSelect={(r) => setReportRange(r ?? undefined)}
              numberOfMonths={1}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {reportRangeStr && (
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Export data</p>
                  <p className="text-xs text-muted-foreground">
                    Download all appointments in the selected range as CSV
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloading}
                  onClick={async () => {
                    if (!reportRangeStr) return;
                    setDownloading(true);
                    try {
                      await downloadAppointmentCsv(supabase, reportRangeStr);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setDownloading(false);
                    }
                  }}
                >
                  <Download className="mr-1.5 size-4" aria-hidden="true" />
                  {downloading ? "Downloading…" : "Download CSV"}
                </Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Appointment summary</CardTitle>
              <CardDescription>
                Created in range, by status and by source.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Pending" value={summary?.pending} />
              <Stat label="Confirmed" value={summary?.confirmed} />
              <Stat label="Cancelled" value={summary?.cancelled} />
              <Stat label="Online" value={summary?.online} />
              <Stat label="Walk-in" value={summary?.walkIn} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>No-show rate</CardTitle>
              <CardDescription>
                Past confirmed appointments only. Unmarked ones count as
                no-shows for this report.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Attended" value={noShow?.attended} />
              <Stat label="Marked no-show" value={noShow?.noShowMarked} />
              <Stat label="Unmarked (inferred)" value={noShow?.noShowInferred} />
              <Stat
                label="No-show rate"
                value={noShow === undefined ? undefined : `${noShow.noShowRatePercent}%`}
              />
              <Stat label="Total past confirmed" value={noShow?.totalPastConfirmed} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
