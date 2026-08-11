/**
 * aggregate-forecast-status.ts — one verdict for the all-budgets spend card
 * (user, 260811).
 *
 * Each budget's cash-flow forecast already answers "does this household run out
 * of money in the window". Across budgets the answer is not a simple OR, because
 * the person reading the card owns all of them: a hole in one budget is only a
 * real problem if the others cannot cover it.
 *
 *   green   every budget stays above zero on its own.
 *   yellow  at least one budget goes under, but the spare cash in the others
 *           would close every hole — money needs MOVING, not earning.
 *   red     the holes are deeper than everything else put together.
 *
 * Two figures per budget, both straight off its projection:
 *
 *   shortfallCents  the deepest point below zero (worstShortfall). The deepest
 *                   hole is what has to be covered — a shallower dip earlier is
 *                   already inside it.
 *   spareCents      the LOWEST projected cash across the window. That is what a
 *                   budget can lend without going under itself; its balance
 *                   today is not lendable if a bill needs it next week.
 *
 * Both are clamped at zero by the caller's construction: a budget with a hole
 * has no spare, and a budget with spare has no hole.
 */

export type AggregateForecastStatus = "green" | "yellow" | "red";

export interface BudgetForecastPosition {
  /** Deepest projected shortfall, ≥ 0. Zero when the budget never goes under. */
  shortfallCents: bigint;
  /** Lowest projected cash, ≥ 0. Zero when the budget goes under at any point. */
  spareCents: bigint;
}

export function aggregateForecastStatus(
  rows: readonly BudgetForecastPosition[],
): AggregateForecastStatus {
  let need = 0n;
  let spare = 0n;
  for (const r of rows) {
    // A budget is one or the other, never both.
    if (r.shortfallCents > 0n) need += r.shortfallCents;
    else spare += r.spareCents > 0n ? r.spareCents : 0n;
  }
  if (need === 0n) return "green";
  return spare >= need ? "yellow" : "red";
}
