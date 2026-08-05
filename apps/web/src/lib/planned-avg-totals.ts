/**
 * planned-avg-totals.ts — the average month behind the by-category bars (260805).
 *
 * "How far off plan, by category" draws one bar per category, each of them that
 * category's average month over the range. The bars say which categories drift;
 * they never say what the month adds up to, so the member could see six red bars
 * without knowing whether that was 200 zł or 2,000.
 *
 * Summed, not averaged again: adding the per-category averages gives what a
 * typical month plans and spends in total, which is the question. A mean of the
 * means would answer "how big is a typical CATEGORY" instead.
 */
export interface PlannedAvgRow {
  planned_avg_cents: string;
  real_avg_cents: string;
}

export interface PlannedAvgTotals {
  plannedCents: number;
  realCents: number;
  /** Spent minus planned: over plan is positive, like the bars' percent. */
  diffCents: number;
  /** null when nothing was planned — 0% would read as "on plan". */
  pct: number | null;
}

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function plannedAvgTotals(
  rows: readonly PlannedAvgRow[],
): PlannedAvgTotals {
  const plannedCents = rows.reduce((a, r) => a + num(r.planned_avg_cents), 0);
  const realCents = rows.reduce((a, r) => a + num(r.real_avg_cents), 0);
  const diffCents = realCents - plannedCents;
  return {
    plannedCents,
    realCents,
    diffCents,
    pct: plannedCents > 0 ? (diffCents / plannedCents) * 100 : null,
  };
}
