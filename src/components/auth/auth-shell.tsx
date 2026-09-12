import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";

import { CLINIC } from "@/lib/brand";
import { ClinicSeal } from "@/components/clinic-seal";

const FLOW = [
  "Send a request for an open time.",
  "The front desk calls you to arrange payment.",
  "We confirm it and text you.",
] as const;

/*
 * Sign-in sits inside the clinic's world rather than floating as a card: the
 * deep field carries the name and the honest flow, and the form keeps a calm
 * cream ground because this is a task, not a pitch. A photograph rests inside
 * the field at low opacity — texture you feel more than see, never competing
 * with the form.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
      <aside className="field relative overflow-hidden px-6 py-7 sm:px-10 lg:py-12">
        <div aria-hidden className="rule-gold absolute inset-x-0 top-0 h-px opacity-70" />
        <div aria-hidden className="absolute inset-0">
          <Image
            src={CLINIC.images.texture.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 46vw, 100vw"
            className="object-cover opacity-[0.13]"
          />
        </div>

        <div className="relative flex flex-1 flex-col justify-between gap-10">
          <Link href="/" className="flex items-center gap-3 self-start">
            <ClinicSeal />
            <span className="font-heading text-base">{CLINIC.name}</span>
          </Link>

          <div className="hidden lg:block">
            <p className="text-meta text-field-muted uppercase">
              Cagayan de Oro · Family medicine
            </p>
            <p className="font-heading text-title mt-3 text-balance">
              {CLINIC.tagline}
            </p>
            <ol className="mt-7 flex flex-col gap-3.5">
              {FLOW.map((line, index) => (
                <li key={line} className="flex items-baseline gap-3">
                  <span className="figure text-meta text-[var(--gold)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-pretty text-field-muted">{line}</span>
                </li>
              ))}
            </ol>
          </div>

          <p className="text-meta hidden text-field-muted uppercase lg:block">
            {CLINIC.address}
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8 lg:py-12">
        <div className="w-full max-w-md">
          <h1 className="font-heading text-title text-balance">{title}</h1>
          <p className="text-lead mt-2.5 text-pretty text-muted-foreground">
            {description}
          </p>
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
