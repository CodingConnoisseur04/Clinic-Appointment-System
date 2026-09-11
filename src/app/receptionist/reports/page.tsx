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
import { getSmsReport, type SmsReport } from "@/lib/reports/get-sms-report";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toDateInput } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadAppointmentCsv } from "@/lib/reports/download-csv";
import { PageMasthead } from "@/components/console/page-masthead";
import { ProportionBar } from "@/components/console/proportion-bar";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

const C = {
  primary: "var(--primary)",
  gold: "var(--gold)",
  destructive: "var(--destructive)",
  stone: "#a8a29e",
  deep: "var(--field)",
};

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
  const [sms, setSms] = useState<SmsReport>();
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
      const [ns, sum, smsReport] = await Promise.all([
        getNoShowReport(supabase, reportRangeStr),
        getAppointmentSummary(supabase, reportRangeStr),
        getSmsReport(supabase, reportRangeStr),
      ]);
      if (!cancelled) {
        setNoShow(ns);
        setSummary(sum);
        setSms(smsReport);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, reportRangeStr]);

  const smsTotal =
    (sms?.confirmationSent ?? 0) +
    (sms?.confirmationFailed ?? 0) +
    (sms?.reminderSent ?? 0) +
    (sms?.reminderFailed ?? 0);
  const smsDelivered = (sms?.confirmationSent ?? 0) + (sms?.reminderSent ?? 0);
  const smsRate = smsTotal === 0 ? 0 : Math.round((smsDelivered / smsTotal) * 100);

  const loading = !summary || !noShow || !sms;

  return (
    <div className="flex flex-col gap-6">
      <PageMasthead
        meta="Analysis"
        title="Reports"
        lead="How much work the clinic took in, how often people did not turn up, and whether the texts actually went out."
        actions={
          <Button
            variant="field-outline"
            size="sm"
            className="h-9 gap-1.5 px-3.5"
            disabled={downloading || !reportRangeStr}
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
            <Download className="size-3.5" aria-hidden="true" />
            {downloading ? "Preparing…" : "Export CSV"}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle>Which days?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Calendar
              mode="range"
              selected={reportRange}
              onSelect={(r) => setReportRange(r ?? undefined)}
              numberOfMonths={1}
              className="mx-auto"
            />
            <p className="text-xs text-muted-foreground">
              Everything below covers the days you highlight. The CSV exports the
              same range.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Volume and mix</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {loading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <p className="text-meta text-muted-foreground uppercase">
                      By outcome
                    </p>
                    <ProportionBar
                      segments={[
                        { label: "Confirmed", value: summary.confirmed, color: C.primary },
                        { label: "Awaiting action", value: summary.pending, color: C.gold },
                        { label: "Cancelled", value: summary.cancelled, color: C.destructive },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-2 border-t border-border pt-5">
                    <p className="text-meta text-muted-foreground uppercase">
                      Where it came from
                    </p>
                    <ProportionBar
                      segments={[
                        { label: "Online request", value: summary.online, color: C.primary },
                        { label: "Walk-in at the desk", value: summary.walkIn, color: C.stone },
                      ]}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Did they turn up?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {loading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : (
                <>
                  <div className="flex items-end gap-4">
                    <p className="stat-figure">
                      {noShow.noShowRatePercent}
                      <span className="stat-figure-unit">%</span>
                    </p>
                    <p className="max-w-xs pb-1.5 text-xs text-pretty text-muted-foreground">
                      of the {noShow.totalPastConfirmed} confirmed appointments
                      that have already happened in this range did not turn up.
                    </p>
                  </div>
                  <ProportionBar
                    emptyLabel="No confirmed appointments have passed yet in this range."
                    segments={[
                      { label: "Attended", value: noShow.attended, color: C.primary },
                      {
                        label: "Marked no-show",
                        value: noShow.noShowMarked,
                        color: C.destructive,
                      },
                      {
                        label: "Never marked",
                        value: noShow.noShowInferred,
                        color: C.gold,
                      },
                    ]}
                  />
                  <p className="border-t border-border pt-4 text-xs text-pretty text-muted-foreground">
                    “Never marked” is counted as a no-show here and only here —
                    it is never written back onto those appointments. Once the
                    front desk marks attendance, this split stops guessing.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Did the texts go out?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {loading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : (
                <>
                  <div className="flex items-end gap-4">
                    <p
                      className={cn(
                        "stat-figure",
                        smsTotal > 0 && smsDelivered < smsTotal && "text-[var(--destructive)]"
                      )}
                    >
                      {smsRate}
                      <span className="stat-figure-unit">%</span>
                    </p>
                    <p className="max-w-xs pb-1.5 text-xs text-pretty text-muted-foreground">
                      reached the patient — {smsDelivered} of {smsTotal} texts
                      sent in this range.
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                    {[
                      { label: "Confirmations sent", value: sms.confirmationSent },
                      {
                        label: "Confirmations failed",
                        value: sms.confirmationFailed,
                        bad: true,
                      },
                      { label: "Reminders sent", value: sms.reminderSent },
                      {
                        label: "Reminders failed",
                        value: sms.reminderFailed,
                        bad: true,
                      },
                    ].map((item) => (
                      <div key={item.label} className="bg-card px-3 py-3">
                        <dt className="text-meta text-muted-foreground uppercase">
                          {item.label}
                        </dt>
                        <dd
                          className={cn(
                            "figure mt-1 text-lg",
                            item.bad && item.value > 0 && "text-[var(--destructive)]"
                          )}
                        >
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-pretty text-muted-foreground">
                    Texts are the clinic&apos;s only notification channel and are
                    never retried automatically. A failure here has to be followed
                    up with a phone call.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
