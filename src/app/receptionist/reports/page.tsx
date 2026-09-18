"use client";

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import {
  getNoShowReport,
  type NoShowReport,
} from "@/lib/reports/get-no-show-report";
import {
  getAppointmentSummary,
  type AppointmentSummary,
} from "@/lib/reports/get-appointment-summary";
import {
  getCollectionSummary,
  type CollectionSummary,
} from "@/lib/reports/get-collection-summary";
import {
  getPeakHours,
  type PeakHoursReport,
} from "@/lib/reports/get-peak-hours";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toDateInput } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadAppointmentCsv } from "@/lib/reports/download-csv";
import { PageMasthead } from "@/components/console/page-masthead";
import { ProportionBar } from "@/components/console/proportion-bar";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  formatDateLong,
  formatDateShort,
  formatTime12h,
} from "@/lib/utils";
import { Download } from "lucide-react";
import { formatPeso } from "@/lib/utils";

const C = {
  primary: "var(--primary)",
  gold: "var(--gold)",
  destructive: "var(--destructive)",
  stone: "#a8a29e",
  deep: "var(--field)",
};

// Chart theming: gold is the money color; the config drives tooltip labels.
const collectionsChartConfig = {
  total: { label: "Collected", color: "var(--gold)" },
} satisfies ChartConfig;

const peakChartConfig = {
  count: { label: "Appointments", color: "var(--primary)" },
} satisfies ChartConfig;

// "Fri 11 Sep" - the axis tick shape, from the shared date formatter.
function shortDay(iso: string): string {
  return formatDateShort(iso);
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
  const [collections, setCollections] = useState<CollectionSummary>();
  const [peakHours, setPeakHours] = useState<PeakHoursReport>();
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
      const [ns, sum, collectionsReport, peaks] = await Promise.all([
        getNoShowReport(supabase, reportRangeStr),
        getAppointmentSummary(supabase, reportRangeStr),
        getCollectionSummary(supabase, reportRangeStr),
        getPeakHours(supabase, reportRangeStr),
      ]);
      if (!cancelled) {
        setNoShow(ns);
        setSummary(sum);
        setCollections(collectionsReport);
        setPeakHours(peaks);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, reportRangeStr]);

  const loading = !summary || !noShow || !collections || !peakHours;

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
              CSV exports this range.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>How much was collected?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {loading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : (
                <>
                  <div className="flex items-end gap-4">
                    <p className="stat-figure">{formatPeso(collections.totalCollected)}</p>
                    <p className="pb-1.5 text-xs text-muted-foreground">
                      across {collections.paidCount} paid appointment
                      {collections.paidCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ProportionBar
                    emptyLabel="No fees logged in this range yet."
                    segments={[
                      { label: "Cash", value: collections.cashTotal, color: C.primary },
                      { label: "GCash", value: collections.gcashTotal, color: C.gold },
                    ]}
                  />
                  {collections.perDay.length > 0 && (
                    <div className="print-chart">
                      <p className="text-meta text-muted-foreground uppercase">
                        Collected per day
                      </p>
                      <ChartContainer
                        config={collectionsChartConfig}
                        className="mt-2 h-36 w-full sm:h-44"
                      >
                        <AreaChart data={collections.perDay} margin={{ left: 4, right: 8, top: 8 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            minTickGap={28}
                            tickFormatter={shortDay}
                          />
                          <YAxis
                            width={52}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => `${v.toLocaleString("en-PH")}`}
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => (
                                  <span className="figure font-medium">
                                    {formatPeso(Number(value))}
                                  </span>
                                )}
                                labelFormatter={(label) => formatDateLong(String(label))}
                              />
                            }
                          />
                          <Area
                            dataKey="total"
                            type="monotone"
                            stroke="var(--gold)"
                            strokeWidth={2}
                            fill="var(--gold)"
                            fillOpacity={0.14}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ChartContainer>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                    {[
                      {
                        label: "Average fee",
                        value: formatPeso(Math.round(collections.averageFee * 100) / 100),
                      },
                      {
                        label: "Paid visits",
                        value: String(collections.attendedCount),
                      },
                      {
                        label: "From attended",
                        value: formatPeso(collections.attendedTotal),
                      },
                      {
                        label: "Prepaid no-shows",
                        value: formatPeso(collections.prepaidNoShowTotal),
                      },
                    ].map((item) => (
                      <div key={item.label} className="bg-card px-3 py-3">
                        <dt className="text-meta text-muted-foreground uppercase">
                          {item.label}
                        </dt>
                        <dd className="figure mt-1 text-lg">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex items-baseline justify-between gap-3 border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">
                      Senior/PWD discounts granted
                    </p>
                    <p className="figure shrink-0 text-sm font-medium">
                      {formatPeso(collections.discountsGranted)}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="print-chart">
            <CardHeader>
              <CardTitle>When do we get busy?</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {loading ? (
                <Skeleton className="h-20 rounded-lg" />
              ) : peakHours.slots.length === 0 ? (
                <p className="text-sm text-pretty text-muted-foreground">
                  No appointments dated in this range yet.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline gap-3">
                    <p className="stat-figure">
                      {formatTime12h(peakHours.peakTime ?? "")}
                    </p>
                    <p className="pb-1 text-xs text-muted-foreground">
                      busiest slot · {peakHours.peakCount} appointment
                      {peakHours.peakCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChartContainer
                    config={peakChartConfig}
                    className="h-40 w-full sm:h-48"
                  >
                    <BarChart
                      data={peakHours.slots}
                      margin={{ left: 4, right: 8, top: 8 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        tickLine={false}
                        axisLine={false}
                        minTickGap={16}
                        tickFormatter={(t: string) => formatTime12h(t).replace(" ", "")}
                      />
                      <YAxis
                        width={28}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => (
                              <span className="figure font-medium">{String(value)}</span>
                            )}
                            labelFormatter={(label) => formatTime12h(String(label))}
                          />
                        }
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--primary)"
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ChartContainer>
                </>
              )}
            </CardContent>
          </Card>

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
                    <p className="pb-1.5 text-xs text-muted-foreground">
                      of {noShow.totalPastConfirmed} past confirmed appointment
                      {noShow.totalPastConfirmed === 1 ? "" : "s"}
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
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
