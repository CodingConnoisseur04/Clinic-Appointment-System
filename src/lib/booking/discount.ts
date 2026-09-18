/*
 * Senior/PWD discount math (upgrade Feature 2).
 *
 * The discount is a PREFILL and a RECORD, never an enforcement: the desk can
 * always override the fee, and the stored payment_amount is the truth. These
 * helpers are pure on purpose — the harness tests them with no database.
 */

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * fee × (1 − pct/100), rounded to centavos. pct outside 0–100 (or not a
 * number) is treated as 0, so a broken setting can never inflate a fee.
 */
export function applyDiscountPct(base: number, pct: number): number {
  const clamped = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return round2(base * (1 - clamped / 100));
}

/**
 * The peso gap between the normal fee and what was actually charged — the
 * number stored in appointments.discount_amount. A charge ABOVE the normal
 * fee is not a discount; it clamps to 0 so the report never invents one.
 */
export function discountFromAmounts(base: number, charged: number): number {
  return Math.max(0, round2(base - charged));
}
