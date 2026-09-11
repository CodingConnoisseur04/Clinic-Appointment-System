import { cn } from "@/lib/utils";

/*
 * The clinic's seal. A gold monogram in the serif — the one gold element on
 * the chrome, and the only place the clinic marks its own name.
 */
export function ClinicSeal({
  size = "md",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-heading grid shrink-0 place-items-center rounded-lg bg-[var(--gold)] leading-none text-[var(--gold-foreground)]",
        size === "sm" ? "size-7 text-sm" : "size-9 text-base",
        className
      )}
    >
      GF
    </span>
  );
}
