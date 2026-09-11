import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * An empty state is a designed page, not a sentence. Blank ruled space is
 * honest — it says "this part of the book has nothing written in it yet" —
 * and it always offers the one action that would fill it.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center",
        className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--gold)]" />
      <p className="text-section text-foreground text-balance">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-pretty text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
