import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

/*
 * The ledger. The desk's paper appointment book is the object this app
 * replaced, so the app is built from the same parts: ruled lines, a time
 * running down the left gutter, records entered in reading order. Rows ink in
 * with an authored stagger (-–i), the way a hand fills a book.
 */

export function Ledger({
  children,
  className,
  ...rest
}: React.ComponentProps<"ol">) {
  return (
    <ol className={cn("border-t border-border", className)} {...rest}>
      {children}
    </ol>
  );
}

export function LedgerRow({
  index = 0,
  children,
  className,
  ...rest
}: React.ComponentProps<"li"> & { index?: number }) {
  return (
    <li
      className={cn("ledger-row ink-in", className)}
      style={{ "--i": index } as CSSProperties}
      {...rest}
    >
      {children}
    </li>
  );
}

/** The time, sitting on the rule in the left gutter. Always mono. */
export function LedgerTime({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "figure text-sm sm:text-data",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {children}
    </div>
  );
}

/** A tracked section heading inside a ledger — a date, a group of records. */
export function LedgerHeading({
  children,
  trailing,
  className,
}: {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-6 flex items-baseline justify-between gap-4 border-b-2 border-foreground/12 pb-2 first:mt-0",
        className
      )}
    >
      <h2 className="text-meta text-muted-foreground uppercase">{children}</h2>
      {trailing ? (
        <span className="figure text-xs text-muted-foreground">{trailing}</span>
      ) : null}
    </div>
  );
}
