import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CollectionSummary = {
  // Every appointment carrying an amount is money that entered the clinic,
  // whatever later happened to the visit — matches a real collections logbook.
  totalCollected: number;
  paidCount: number;
  cashTotal: number;
  gcashTotal: number;
  averageFee: number;
  // Subset above: visits that actually happened. The gap between the two
  // totals is what prepaying no-shows left behind — surfaced, never hidden.
  attendedTotal: number;
  attendedCount: number;
  prepaidNoShowTotal: number;
  // Sum of appointments.discount_amount in range: what the desk gave away as
  // senior/PWD discounts (RA 9994 / RA 10754). The desk records it per
  // appointment; this only adds up what was recorded.
  discountsGranted: number;
};

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function empty(): CollectionSummary {
  return {
    totalCollected: 0,
    paidCount: 0,
    cashTotal: 0,
    gcashTotal: 0,
    averageFee: 0,
    attendedTotal: 0,
    attendedCount: 0,
    prepaidNoShowTotal: 0,
    discountsGranted: 0,
  };
}

// Collections view: fees logged against appointments DATED within the range —
// the day the money was taken, not the day the record was created (a walk-in
// booked next week for a visit this week collected its fee this week).
// Caller's RLS session applies, consistent with the other report functions.
export async function getCollectionSummary(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<CollectionSummary> {
  if (!rangeSchema.safeParse(range).success) return empty();

  const { data, error } = await supabase
    .from("appointments")
    .select("appointment_date, payment_method, payment_amount, discount_amount, attendance")
    .gte("appointment_date", range.from)
    .lte("appointment_date", range.to)
    .not("payment_amount", "is", null);

  if (error || !data) return empty();

  const summary = empty();
  let sum = 0;
  for (const row of data as {
    payment_method: string | null;
    payment_amount: number | null;
    discount_amount: number | null;
    attendance: string | null;
  }[]) {
    const amount = Number(row.payment_amount ?? 0);
    sum += amount;
    if (row.discount_amount !== null && row.discount_amount !== undefined) {
      summary.discountsGranted += Number(row.discount_amount);
    }
    summary.paidCount += 1;
    if (row.payment_method === "gcash") summary.gcashTotal += amount;
    else summary.cashTotal += amount;
    if (row.attendance === "ATTENDED") {
      summary.attendedTotal += amount;
      summary.attendedCount += 1;
    } else if (row.attendance === "NO_SHOW") {
      summary.prepaidNoShowTotal += amount;
    }
  }
  summary.totalCollected = sum;
  summary.averageFee = summary.paidCount === 0 ? 0 : sum / summary.paidCount;
  return summary;
}
