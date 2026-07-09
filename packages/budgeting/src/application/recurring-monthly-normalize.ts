/**
 * recurring-monthly-normalize.ts — pure 4-cadence → monthly-cents normalizer (11-04).
 *
 * recurring_rules.cadence CHECK allows DAILY/WEEKLY/MONTHLY/YEARLY (Pitfall 2), so
 * all four must map to a comparable monthly figure for the per-category recurring
 * chart. Uses average-month constants (a distribution chart, not a calendar
 * projection — ponytail: exact per-month calendar firing isn't needed here).
 *
 * Integer rounding (round-half-up for positive cents) keeps everything in bigint.
 */
export const DAYS_PER_MONTH = 30.44; // average Gregorian month
export const WEEKS_PER_MONTH = 4.345; // 52.14 / 12

export type Cadence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export function recurringMonthlyNormalize(
  amountCents: bigint,
  cadence: Cadence,
): bigint {
  switch (cadence) {
    case "DAILY":
      // × 30.44 = × 3044 / 100, rounded
      return (amountCents * 3044n + 50n) / 100n;
    case "WEEKLY":
      // × 4.345 = × 4345 / 1000, rounded
      return (amountCents * 4345n + 500n) / 1000n;
    case "MONTHLY":
      return amountCents;
    case "YEARLY":
      // ÷ 12, rounded
      return (amountCents + 6n) / 12n;
  }
}
