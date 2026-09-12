import type { ReactNode } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/*
 * The masthead is the app's identity carrier. Every page opens with one, and
 * it is never the same twice because it carries that page's real context —
 * the date, the counts, the primary action — instead of a bare page title.
 *
 * The optional photo slot is a material of the field, not an illustration
 * bolted on: it occupies the right column on desktop and a bottom band on
 * mobile, and merges into the deep field with a gradient so the photograph
 * reads as part of the same wall. Pages that are dense data surfaces simply
 * omit it.
 */
export function PageMasthead({
  title,
  meta,
  lead,
  actions,
  image,
  children,
  className,
}: {
  title: string;
  /** Small tracked line above the title: the date, the section, the scope. */
  meta?: ReactNode;
  /** One sentence of plain explanation. Not a subtitle for its own sake. */
  lead?: ReactNode;
  actions?: ReactNode;
  /** Optional photograph. Alt text is required; decorative use goes elsewhere. */
  image?: { src: string; alt: string };
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "field relative overflow-hidden rounded-2xl shadow-warm-lg",
        className
      )}
    >
      <div
        aria-hidden
        className="rule-gold rule-draw absolute inset-x-0 top-0 h-px"
      />
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              {meta ? (
                <p className="text-meta text-field-muted uppercase">{meta}</p>
              ) : null}
              <h1 className="font-heading text-title mt-2 text-balance">
                {title}
              </h1>
              {lead ? (
                <p className="text-lead mt-2.5 max-w-prose text-pretty text-field-muted">
                  {lead}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </div>
        {image ? (
          <div className="relative h-44 w-full shrink-0 overflow-hidden sm:h-auto sm:w-56 lg:w-72">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 288px, (min-width: 640px) 224px, 100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-r from-[var(--field)] via-[color-mix(in_oklab,var(--field)_38%,transparent)] to-transparent"
            />
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/*
 * A strip of facts that sits at the foot of a masthead: counts the staff reads
 * at a glance. Figures are mono so columns line up down the page.
 */
export function MastheadStats({
  stats,
}: {
  stats: { label: string; value: ReactNode; tone?: "gold" | "default" }[];
}) {
  return (
    <dl className="grid grid-cols-2 border-t sm:grid-cols-4 sm:divide-x field-rule">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="field-rule border-b px-5 py-3.5 last:border-b-0 sm:border-b-0 sm:px-7"
        >
          <dt className="text-meta text-field-muted uppercase">{stat.label}</dt>
          <dd
            className={cn(
              "figure mt-1 text-xl",
              stat.tone === "gold" ? "text-[var(--gold)]" : "text-field-foreground"
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
