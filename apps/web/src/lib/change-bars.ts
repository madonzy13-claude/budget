/**
 * Investments "Average change" bars — Contributions · P/L · Total per period.
 * Rows are built by lib/investment-return (P/L % = the investment return).
 */
export type ChangeBarRow = {
  label: string;
  total: number;
  totalDelta: number;
  pl: number;
  plDelta: number;
  contrib: number;
  contribDelta: number;
};

/** Geometric mean of per-period %s — growth compounds. */
export function geoMean(pcts: (number | null)[]): number | null {
  const nn = pcts.filter((p): p is number => p !== null);
  if (nn.length === 0) return null;
  const product = nn.reduce((a, p) => a * (1 + p / 100), 1);
  if (product < 0) return null; // a ≤ −100% period → undefined
  return (Math.pow(product, 1 / nn.length) - 1) * 100;
}
