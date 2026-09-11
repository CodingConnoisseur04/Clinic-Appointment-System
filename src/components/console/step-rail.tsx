import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type Step = {
  label: string;
  hint?: string;
  state: "done" | "current" | "todo";
};

/*
 * A rail of numbered steps. Both the patient request and the desk's walk-in
 * registration are three-part tasks, and both read as one long undifferentiated
 * form without it. Gold marks the step you are standing on.
 */
export function StepRail({
  steps,
  className,
}: {
  steps: Step[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3",
        className
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn(
            "flex items-start gap-3 bg-card px-4 py-3.5",
            step.state === "current" && "bg-highlight"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "figure grid size-6 shrink-0 place-items-center rounded-md border text-xs",
              step.state === "done" && "border-primary bg-primary text-primary-foreground",
              step.state === "current" && "border-[var(--gold)] text-[var(--gold-ink)]",
              step.state === "todo" && "border-border text-muted-foreground"
            )}
          >
            {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span className="min-w-0">
            <span
              className={cn(
                "block text-section text-sm",
                step.state === "todo" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {step.label}
            </span>
            {step.hint ? (
              <span className="mt-0.5 block text-xs text-pretty text-muted-foreground">
                {step.hint}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
