import Big from "big.js";
import { Temporal } from "temporal-polyfill";

// A bank deposit accrues interest at an annual rate, compounding ("capitalizing")
// on a fixed cadence. Between capitalizations the value still creeps up every day
// (simple accrual on the current base); on each capitalization boundary the
// accrued interest folds into the base so future interest earns on top of it —
// exactly how a bank statement behaves. The whole thing is a deterministic
// function of (principal, rate, start, cadence, as-of) so we compute it on read;
// no daily job, and re-reading after a capitalization can never "lose" earnings
// because the base is always rebuilt from the start date.
//
// Day count is actual/365 fixed. If an end (maturity) date is set the value
// freezes there — it keeps every cent earned but stops accruing.

export type CapFrequency =
  | "daily"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";

export const CAP_FREQUENCIES: CapFrequency[] = [
  "daily",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
];

const MONTHS_PER_STEP: Record<Exclude<CapFrequency, "daily">, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export interface DepositInput {
  principalCents: bigint | string | number;
  rateBps: number; // annual rate in basis points (e.g. 525 = 5.25%)
  startDate: string; // 'YYYY-MM-DD' (first day interest starts accruing)
  capFrequency: CapFrequency;
  asOf: string; // 'YYYY-MM-DD' (the day we're valuing at, usually today)
  endDate?: string | null; // 'YYYY-MM-DD' maturity; value freezes on/after it
}

function daysBetween(from: Temporal.PlainDate, to: Temporal.PlainDate): number {
  return from.until(to, { largestUnit: "day" }).days;
}

// Interest accrued over a span of `days` on `base` at annual fraction `r`,
// actual/365. Returned as a Big so callers keep full precision until the final
// round — rounding mid-compound would drift.
function accrue(base: Big, r: Big, days: number): Big {
  return base.plus(base.times(r).times(days).div(365));
}

/**
 * Current value of a deposit, in integer cents (as a string, matching the
 * domain's money-as-string convention). Always >= principal.
 */
export function computeDepositValueCents(input: DepositInput): string {
  const principal = new Big(String(input.principalCents));
  const r = new Big(input.rateBps).div(10000);
  const start = Temporal.PlainDate.from(input.startDate);

  let asOf = Temporal.PlainDate.from(input.asOf);
  if (input.endDate) {
    const end = Temporal.PlainDate.from(input.endDate);
    if (Temporal.PlainDate.compare(asOf, end) > 0) asOf = end; // freeze at maturity
  }

  // Not started yet (or exactly on the start day): nothing has accrued.
  if (Temporal.PlainDate.compare(asOf, start) <= 0 || input.rateBps === 0) {
    return principal.round(0, Big.roundHalfUp).toFixed(0);
  }

  // Daily capitalization is uniform (every period is exactly one day), so use the
  // closed form instead of looping thousands of times over multi-year deposits.
  if (input.capFrequency === "daily") {
    const n = daysBetween(start, asOf);
    const factor = new Big(1).plus(r.div(365));
    return principal.times(factor.pow(n)).round(0, Big.roundHalfUp).toFixed(0);
  }

  const months = MONTHS_PER_STEP[input.capFrequency];
  let base = principal;
  let cursor = start;
  // Fold in every full capitalization period that has completed by `asOf`.
  for (;;) {
    const next = cursor.add({ months });
    if (Temporal.PlainDate.compare(next, asOf) > 0) break;
    base = accrue(base, r, daysBetween(cursor, next));
    cursor = next;
  }
  // Simple accrual for the partial period since the last capitalization.
  const value = accrue(base, r, daysBetween(cursor, asOf));
  return value.round(0, Big.roundHalfUp).toFixed(0);
}

/** Accrued interest = current value − principal, in integer cents (string). */
export function computeDepositAccruedCents(input: DepositInput): string {
  const value = new Big(computeDepositValueCents(input));
  return value.minus(new Big(String(input.principalCents))).toFixed(0);
}
