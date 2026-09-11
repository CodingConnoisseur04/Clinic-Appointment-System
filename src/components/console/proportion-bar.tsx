import { cn } from "@/lib/utils";

export type ProportionSegment = {
  label: string;
  value: number;
  color: string;
};

/*
 * Report data drawn from the real numbers, not from a chart library. One bar
 * per composition question with its own legend, so a reader can see the shape
 * of the mix before reading any figure.
 */
export function ProportionBar({
  segments,
  emptyLabel = "No records in this range",
  className,
}: {
  segments: ProportionSegment[];
  emptyLabel?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <p
        className={cn(
          "rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground",
          className
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.label}
              style={{
                width: `${(s.value / total) * 100}%`,
                backgroundColor: s.color,
              }}
            />
          ))}
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-baseline gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 self-center rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="figure text-sm">{s.value}</dd>
            <span className="figure text-xs text-muted-foreground">
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </dl>
    </div>
  );
}
