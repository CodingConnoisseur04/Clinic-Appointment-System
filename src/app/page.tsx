/*
 * DESIGN CONTRACT — "Warm Confidence", photographic (revamp 2)
 * THESIS: the clinic's front wall with its windows open. The deep field still
 *   carries the name and the honest request-then-confirm flow, and real
 *   photography — Filipino clinic life, warm daylight — is now a first-class
 *   material of the wall: the hero looks through a window into the consult
 *   room, the notices carry their own photographs, the closing band stands in
 *   the clinic itself.
 * OWN-WORLD: deep forest field (#143d28), warm cream ground, gold only where
 *   it means something, photographs merged into the field with gradients,
 *   mono for every time and figure, one ruled step sequence.
 * STORY: visitor sees the clinic's people before its name, learns that it is
 *   open and when, that requests are confirmed by a person after payment —
 *   then signs up.
 * FIRST VIEWPORT: field band with display-scale name, tagline, primary
 *   action, live hours, the hero photograph, and the three ruled steps.
 * FORM: persuade mode. Seed key design-revamp-2 (photographic pass).
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, DESIGN.md, and every shipping raster carrying
 *   its provenance (public/images/CREDITS.md).
 */
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import {
  getClinicSettings,
  isPlaceholderPhone,
  PLACEHOLDER_PHONE,
} from "@/lib/clinic-settings";
import { CLINIC } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
import { ClinicSeal } from "@/components/clinic-seal";
import { cn } from "@/lib/utils";

type AvailabilityRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Collapse consecutive days sharing identical hours into ranges ("Mon–Fri").
function formatHours(rows: AvailabilityRow[]): string[] {
  const active = rows
    .filter((r) => r.is_active)
    .sort((a, b) => a.day_of_week - b.day_of_week);
  const byDay = new Map(active.map((r) => [r.day_of_week, r]));
  const out: string[] = [];

  let i = 0;
  while (i < 7) {
    const row = byDay.get(i);
    if (!row) {
      // Group consecutive closed days.
      let j = i;
      while (j < 7 && !byDay.has(j)) j++;
      out.push(
        j - i === 1
          ? `${DAYS[i]} · Closed`
          : `${DAYS[i].slice(0, 3)}–${DAYS[j - 1].slice(0, 3)} · Closed`
      );
      i = j;
      continue;
    }
    let j = i + 1;
    while (
      j < 7 &&
      byDay.get(j)?.start_time === row.start_time &&
      byDay.get(j)?.end_time === row.end_time
    ) {
      j++;
    }
    const span =
      j - i === 1 ? DAYS[i] : `${DAYS[i].slice(0, 3)}–${DAYS[j - 1].slice(0, 3)}`;
    out.push(
      `${span} · ${formatTime(row.start_time)} – ${formatTime(row.end_time)}`
    );
    i = j;
  }
  return out.length > 0 ? out : ["Hours not posted yet"];
}

/* Today's real state, so the page answers the visitor's actual first question. */
function todayLine(rows: AvailabilityRow[]): string {
  const active = rows.filter((r) => r.is_active);
  const byDay = new Map(active.map((r) => [r.day_of_week, r]));
  const today = new Date().getDay();
  const todayRow = byDay.get(today);
  if (todayRow) {
    return `Open today until ${formatTime(todayRow.end_time)} · Walk-ins welcome`;
  }
  for (let offset = 1; offset <= 7; offset++) {
    const next = (today + offset) % 7;
    const row = byDay.get(next);
    if (row) {
      return `Closed today · Next open ${DAYS[next]} at ${formatTime(row.start_time)}`;
    }
  }
  return "Walk-ins welcome during clinic hours";
}

function GoldPin({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gold)] ring-2 ring-[var(--gold)]/30 ${className}`}
    />
  );
}

const STEPS = [
  {
    n: "01",
    title: "Send a request",
    body: "Pick a day and a time that is open. It takes about three minutes, and nothing is charged.",
  },
  {
    n: "02",
    title: "The front desk calls you",
    body: "A real person arranges payment with you cash or GCash and answers anything you need to ask.",
  },
  {
    n: "03",
    title: "You get a text",
    body: "Your appointment is confirmed and texted to you. Only then is the time held as yours.",
  },
] as const;

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = await createClient();
  const [{ data: availability }, clinicSettings] = await Promise.all([
    supabase
      .from("doctor_availability")
      .select("day_of_week, start_time, end_time, is_active"),
    getClinicSettings(supabase),
  ]);
  const rows = (availability ?? []) as AvailabilityRow[];
  const hours = formatHours(rows);
  const openToday = todayLine(rows);
  const hasRealPhone = !isPlaceholderPhone(clinicSettings.receptionist_phone);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <div
        hidden
        dangerouslySetInnerHTML={{
          __html:
            '<!-- DESIGN CONTRACT seed=design-revamp-2 THESIS: the clinic front wall with its windows open; deep forest field carries the name and the honest request-then-confirm flow, real photography is a material of the wall, pinned community board below. OWN-WORLD: forest field #143d28, cream ground, gold only where it means something, photographs merged into the field, mono figures, one ruled step sequence. STORY: see the clinic\'s people, learn when it is open, learn that a person confirms after payment. FIRST VIEWPORT: field band with display-scale name, tagline, primary action, live hours, hero photograph, three ruled steps. FORM: persuade mode. FINISH: provenance in public/images/CREDITS.md. -->',
        }}
      />

      {/* ── The field: the clinic's front wall, windows open ───────────── */}
      <div className="field relative overflow-hidden">
        <div
          aria-hidden
          className="rule-gold absolute inset-x-0 top-0 h-px opacity-70"
        />
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <span className="flex items-center gap-3">
            <ClinicSeal />
            <span className="text-meta text-field-muted uppercase">
              Cagayan de Oro
            </span>
          </span>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "field-outline", size: "sm" }),
              "h-9 px-3.5"
            )}
          >
            Log in
          </Link>
        </header>

        <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-14 sm:px-6 lg:min-h-[74svh] lg:pt-4 lg:pb-16">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
            <div className="max-w-3xl">
              <h1 className="font-heading text-display text-balance">
                {CLINIC.name}
              </h1>
              <p className="text-lead mt-5 max-w-prose text-pretty text-field-muted">
                {CLINIC.tagline} Appointments are requested online and confirmed
                by our front desk so the time you get is a time we have actually
                checked, every single day.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ variant: "field", size: "lg" }),
                    "h-11 px-6 text-base"
                  )}
                >
                  Request an appointment
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "field-outline", size: "lg" }),
                    "h-11 px-6 text-base"
                  )}
                >
                  I already have an account
                </Link>
              </div>
              <p className="figure mt-5 text-sm text-field-muted">{openToday}</p>
            </div>

            {/* The window into the consult room. */}
            <figure className="relative m-0 lg:mt-2">
              <div className="relative overflow-hidden rounded-2xl shadow-warm-lg field-rule border">
                <Image
                  src={CLINIC.images.heroFamily.src}
                  alt={CLINIC.images.heroFamily.alt}
                  width={1920}
                  height={1280}
                  priority
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="h-auto w-full object-cover"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-[var(--field)]/55 via-transparent to-transparent"
                />
              </div>
              <figcaption className="text-meta mt-3 text-right text-field-muted uppercase">
                Every visit, taken personally
              </figcaption>
            </figure>
          </div>

          {/* The honest flow, stated before anyone signs up. */}
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border field-rule bg-[var(--field-border)] sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.n}
                className="ink-in bg-[color-mix(in_oklab,var(--field-foreground)_6%,var(--field))] px-5 py-5"
                style={{ "--i": index } as React.CSSProperties}
              >
                <span className="figure text-meta text-[var(--gold)]">
                  {step.n}
                </span>
                <h2 className="text-section mt-2 text-field-foreground">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-xs text-pretty text-field-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* ── The board: pinned notices on the cream ground ───────────────── */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-14 sm:px-6">
        <div className="w-full">
          <div className="mb-8 flex items-end justify-between gap-6">
            <h2 className="font-heading text-title text-balance">
              What you will find here
            </h2>
            <p className="text-meta hidden max-w-xs text-right text-muted-foreground uppercase sm:block">
              Posted at the clinic, kept up to date
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-8 rounded-2xl border border-border bg-[var(--board)] p-5 shadow-warm-lg sm:p-8 lg:grid-cols-3">
            {/* Services */}
            <section
              className="pin-notice relative mt-3 rounded-xl bg-card p-6 shadow-warm lg:-rotate-[0.6deg]"
              style={{ animationDelay: "80ms" }}
              aria-labelledby="services-heading"
            >
              <GoldPin />
              <h3 id="services-heading" className="font-heading text-xl">
                What we treat
              </h3>
              <div className="relative mt-4 overflow-hidden rounded-lg">
                <Image
                  src={CLINIC.images.bpCheck.src}
                  alt={CLINIC.images.bpCheck.alt}
                  width={1600}
                  height={1067}
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  className="h-36 w-full object-cover"
                />
              </div>
              <ul className="mt-4 space-y-2.5">
                {CLINIC.services.map((service) => (
                  <li key={service} className="flex items-start gap-2.5 text-sm text-stone-700">
                    <span
                      aria-hidden
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--gold)]"
                    />
                    {service}
                  </li>
                ))}
              </ul>
            </section>

            {/* Hours */}
            <section
              className="pin-notice relative mt-3 rounded-xl bg-card p-6 shadow-warm"
              style={{ animationDelay: "160ms" }}
              aria-labelledby="hours-heading"
            >
              <GoldPin />
              <h3 id="hours-heading" className="font-heading text-xl">
                Clinic hours
              </h3>
              <dl className="mt-4 space-y-2.5">
                {hours.map((line) => {
                  const [span, times] = line.split(" · ");
                  return (
                    <div key={line} className="flex items-baseline justify-between gap-3">
                      <dt className="text-sm font-medium text-stone-800">{span}</dt>
                      <dd className="figure text-sm text-stone-600">{times ?? line}</dd>
                    </div>
                  );
                })}
              </dl>
              <div className="relative mt-4 overflow-hidden rounded-lg">
                <Image
                  src={CLINIC.images.waitingRoom.src}
                  alt={CLINIC.images.waitingRoom.alt}
                  width={1600}
                  height={1067}
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  className="h-36 w-full object-cover"
                />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Hours are set by the doctor and change when the clinic closes for
                a day.
              </p>
            </section>

            {/* Doctor */}
            <section
              className="pin-notice relative mt-3 rounded-xl bg-card p-6 shadow-warm lg:rotate-[0.5deg]"
              style={{ animationDelay: "240ms" }}
              aria-labelledby="doctor-heading"
            >
              <GoldPin />
              <h3 id="doctor-heading" className="font-heading text-xl">
                Your doctor
              </h3>
              <div className="relative mt-4 overflow-hidden rounded-lg">
                <Image
                  src={CLINIC.images.portrait.src}
                  alt={CLINIC.images.portrait.alt}
                  width={1200}
                  height={1598}
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  className="h-44 w-full object-cover object-top"
                />
              </div>
              <p className="figure mt-2 text-right text-[0.65rem] text-muted-foreground">
                {CLINIC.images.portrait.note}
              </p>
              <p className="mt-2 font-medium">{CLINIC.doctorName}</p>
              <p className="text-meta mt-1 text-muted-foreground uppercase">
                {CLINIC.doctorSpecialty}
              </p>
              <p className="mt-4 text-sm text-pretty text-stone-700">
                Every appointment is with the same physician who knows your
                family&apos;s history from routine checkups to minor procedures,
                care stays personal and continuous.
              </p>
            </section>

            {/* Location slip */}
            <section
              className="pin-notice relative rounded-xl bg-card p-6 shadow-warm lg:col-span-3"
              style={{ animationDelay: "320ms" }}
              aria-labelledby="location-heading"
            >
              <h3 id="location-heading" className="sr-only">
                Location and contact
              </h3>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <p className="text-meta text-muted-foreground uppercase">Find us</p>
                  <p className="mt-1.5 text-sm text-stone-700">{CLINIC.address}</p>
                </div>
                <div>
                  <p className="text-meta text-muted-foreground uppercase">Call us</p>
                  {hasRealPhone ? (
                    <a
                      href={`tel:${clinicSettings.receptionist_phone}`}
                      className="figure mt-1.5 block text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {clinicSettings.receptionist_phone}
                    </a>
                  ) : (
                    <div className="mt-1.5">
                      <p className="figure text-sm text-muted-foreground">
                        {PLACEHOLDER_PHONE}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/80">
                        Sample number, for illustration. The clinic&apos;s real
                        line will be posted here once set.
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-meta text-muted-foreground uppercase">
                    Getting seen
                  </p>
                  <p className="mt-1.5 text-sm text-stone-700">
                    Walk-ins are welcome during clinic hours. Online requests are
                    confirmed by the front desk after payment is arranged.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ── Close: standing inside the clinic ──────────────────────────── */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl shadow-warm-lg">
          <Image
            src={CLINIC.images.consult.src}
            alt=""
            width={1200}
            height={1800}
            sizes="(min-width: 640px) 1152px, 100vw"
            className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-[var(--field)] via-[color-mix(in_oklab,var(--field)_86%,transparent)] to-[color-mix(in_oklab,var(--field)_45%,transparent)]"
          />
          <div className="field relative flex flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center sm:px-8">
            <div className="bg-transparent">
              <p className="font-heading text-title text-balance text-field-foreground">
                Ready when you are.
              </p>
              <p className="text-lead mt-2 max-w-prose text-pretty text-field-muted">
                Send a request now and the front desk will call you to settle the
                details.
              </p>
            </div>
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ variant: "field", size: "lg" }),
                "h-11 shrink-0 px-6 text-base"
              )}
            >
              Request an appointment
            </Link>
          </div>
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-7 text-sm text-muted-foreground sm:px-6">
        <p>
          © {new Date().getFullYear()} {CLINIC.name}
        </p>
        <p className="text-meta uppercase">
          {CLINIC.address}
        </p>
      </footer>
    </div>
  );
}
