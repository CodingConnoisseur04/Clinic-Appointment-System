/*
 * DESIGN CONTRACT — seed 09cf66dd (dealt lead, locked: "Neighborhood Bulletin Board")
 * THESIS: the clinic's front wall as a friendly community board; refuses the
 *   brochure-band hero-carousel default.
 * OWN-WORLD: warm linen ground, ink text, one golden-amber accent, white
 *   pinned notices with offset+blur shadows and a single settle motion.
 * STORY: visitor sees services, hours and the doctor at a glance, believes
 *   this is a real local clinic, clicks Log In or Sign Up.
 * FIRST VIEWPORT: header band (name, tagline, Log In / Sign Up) over three
 *   pinned notices — Services left, Hours center, Doctor right; location
 *   slip full-width at the foot of the board. Mobile: notices stack in
 *   reading order.
 * FORM: dealt lead index 5 of 7 grounded structures, surface scope, persuade.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, DESIGN.md, and every shipping raster carrying
 *   its provenance.
 */
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getClinicSettings } from "@/lib/clinic-settings";
import { CLINIC } from "@/lib/brand";
import { buttonVariants } from "@/components/ui/button";
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

function Pin({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-primary/30 ${className}`}
    />
  );
}

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const supabase = await createClient();
  const [{ data: availability }, clinicSettings] = await Promise.all([
    supabase
      .from("doctor_availability")
      .select("day_of_week, start_time, end_time, is_active"),
    getClinicSettings(supabase),
  ]);
  const hours = formatHours((availability ?? []) as AvailabilityRow[]);

  return (
    <div className="flex min-h-dvh flex-col bg-[#faf9f5] text-stone-900">
      <div
        hidden
        dangerouslySetInnerHTML={{
          __html:
            "<!-- DESIGN CONTRACT seed=09cf66dd THESIS: front-wall community board; refuses hero-carousel brochure bands. OWN-WORLD: warm linen ground, ink text, one golden-amber accent, pinned white notices with offset+blur shadows, single settle motion. STORY: visitor sees services, hours and doctor at a glance, trusts this is a real local clinic, clicks Log In or Sign Up. FIRST VIEWPORT: header band with name/tagline/CTAs over three pinned notices (Services, Hours, Doctor), location slip at foot; mobile stacks in reading order. FORM: dealt lead index 5, seed 09cf66dd. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->",
        }}
      />

      {/* Header band */}
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {CLINIC.name}
          </h1>
          <p className="mt-3 max-w-prose text-lg text-stone-600">
            {CLINIC.tagline} · Cagayan de Oro City
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "min-h-11 px-6"
            )}
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "min-h-11 px-6"
            )}
          >
            Log In
          </Link>
        </div>
      </header>

      {/* The board */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 pb-10 sm:px-6">
        <div className="grid w-full grid-cols-1 gap-8 rounded-2xl border border-stone-200/80 bg-[#f3f1e9] p-5 shadow-[0_1px_2px_rgb(28_25_23/0.06),0_8px_24px_-8px_rgb(28_25_23/0.15)] sm:p-8 lg:grid-cols-3">
          {/* Services */}
          <section
            className="pin-notice relative mt-3 rounded-lg bg-white p-6 shadow-[0_2px_4px_rgb(28_25_23/0.08),0_12px_20px_-6px_rgb(28_25_23/0.18)] lg:-rotate-[0.6deg]"
            style={{ animationDelay: "80ms" }}
            aria-labelledby="services-heading"
          >
            <Pin />
            <h2 id="services-heading" className="text-xl font-semibold tracking-tight">
              What we treat
            </h2>
            <ul className="mt-4 space-y-2.5">
              {CLINIC.services.map((service) => (
                <li key={service} className="flex items-start gap-2 text-stone-700">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-600" />
                  {service}
                </li>
              ))}
            </ul>
          </section>

          {/* Hours */}
          <section
            className="pin-notice relative mt-3 rounded-lg bg-white p-6 shadow-[0_2px_4px_rgb(28_25_23/0.08),0_12px_20px_-6px_rgb(28_25_23/0.18)]"
            style={{ animationDelay: "160ms" }}
            aria-labelledby="hours-heading"
          >
            <Pin />
            <h2 id="hours-heading" className="text-xl font-semibold tracking-tight">
              Clinic hours
            </h2>
            <dl className="mt-4 space-y-2.5 tabular-nums">
              {hours.map((line) => {
                const [span, times] = line.split(" · ");
                return (
                  <div key={line} className="flex items-baseline justify-between gap-3">
                    <dt className="font-medium text-stone-800">{span}</dt>
                    <dd className="text-stone-600">{times ?? line}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          {/* Doctor */}
          <section
            className="pin-notice relative mt-3 rounded-lg bg-white p-6 shadow-[0_2px_4px_rgb(28_25_23/0.08),0_12px_20px_-6px_rgb(28_25_23/0.18)] lg:rotate-[0.5deg]"
            style={{ animationDelay: "240ms" }}
            aria-labelledby="doctor-heading"
          >
            <Pin />
            <h2 id="doctor-heading" className="text-xl font-semibold tracking-tight">
              Your doctor
            </h2>
            <p className="mt-4 font-semibold text-amber-800">{CLINIC.doctorName}</p>
            <p className="text-sm text-stone-500">{CLINIC.doctorSpecialty}</p>
            <p className="mt-4 text-stone-700">
              Every appointment is with the same physician who knows your
              family&apos;s history — from routine checkups to minor procedures,
              care stays personal and continuous.
            </p>
          </section>

          {/* Location slip */}
          <section
            className="pin-notice relative rounded-lg bg-white p-6 shadow-[0_2px_4px_rgb(28_25_23/0.08),0_12px_20px_-6px_rgb(28_25_23/0.18)] lg:col-span-3"
            style={{ animationDelay: "320ms" }}
            aria-labelledby="location-heading"
          >
            <h2 id="location-heading" className="sr-only">
              Location and contact
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <p className="font-medium text-stone-800">Find us</p>
                <p className="text-stone-600">{CLINIC.address}</p>
              </div>
              <div className="flex items-start gap-3">
                <p className="font-medium text-stone-800">Call us</p>
                <p className="text-stone-600">
                  {clinicSettings.receptionist_phone}
                </p>
              </div>
              <p className="text-sm text-stone-500">
                Walk-ins welcome during clinic hours.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-stone-400 sm:px-6">
        © {new Date().getFullYear()} {CLINIC.name}
      </footer>
    </div>
  );
}
