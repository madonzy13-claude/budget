/**
 * series-growth.ts — "how far has this moved since the range started" (260804).
 *
 * The investments view has always answered that on every hovered point, in %
 * and in money. Capitalization — both on the budget page and in the all-budgets
 * trend — showed only the absolute value, so the same question needed doing
 * arithmetic in your head.
 *
 * Returns null when there is nothing honest to say: a range that starts at zero
 * has no base to be a percentage of, and the tooltip drops the columns rather
 * than printing an infinity.
 */
export interface SeriesGrowth {
  deltaCents: number;
  /** Signed percent of the first point. */
  pct: number;
}

export function seriesGrowth(
  baseCents: number,
  valueCents: number,
): SeriesGrowth | null {
  if (!Number.isFinite(baseCents) || !Number.isFinite(valueCents)) return null;
  if (baseCents === 0) return null;
  const deltaCents = valueCents - baseCents;
  return { deltaCents, pct: (100 * deltaCents) / baseCents };
}
