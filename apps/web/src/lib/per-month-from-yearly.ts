/**
 * per-month-from-yearly.ts — what a year of scheduled payments costs a month.
 *
 * The "Scheduled payments per year, by category" tooltip shows each payment's
 * working — "3,500 × 12m = 42,000" — but never the figure a limit is actually
 * set in: the monthly one (user, 261016). A category whose year is built from
 * a mix of monthly, yearly and one-off rules cannot be divided in the head.
 *
 * Rounded to the nearest cent, half away from zero, so a negative year is
 * split the same way a positive one is rather than drifting toward zero the
 * way Math.round would.
 */
export function perMonthFromYearlyCents(yearlyCents: number): number {
  const exact = yearlyCents / 12;
  return exact < 0 ? -Math.round(-exact) : Math.round(exact);
}
