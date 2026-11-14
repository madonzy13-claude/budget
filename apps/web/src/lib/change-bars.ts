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

/**
 * How much of a YEAR bar the data covers, [firstMs, lastMs) (261106). "All"
 * groups the bars by year, and the first and the running year are partial:
 * counted whole they dragged the yearly average down. Month and day bars
 * count whole.
 */
export function periodShare(
  label: string,
  firstMs: number,
  lastMs: number,
): number {
  if (!/^\d{4}$/.test(label)) return 1;
  const start = Date.UTC(Number(label), 0, 1);
  const end = Date.UTC(Number(label) + 1, 0, 1);
  const covered = Math.min(lastMs, end) - Math.max(firstMs, start);
  return Math.min(1, Math.max(0, covered / (end - start)));
}

/** Data covering less than one period is never stretched into a whole one. */
export const periodsCovered = (shares: number[]) =>
  Math.max(
    1,
    shares.reduce((a, b) => a + b, 0),
  );

/** Geometric mean of per-period %s — growth compounds. `shares` weighs each
 *  period by how much of it the data covers (periodShare); omitted = whole. */
export function geoMean(
  pcts: (number | null)[],
  shares?: number[],
): number | null {
  const kept = pcts.flatMap((p, i) =>
    p === null ? [] : [{ p, w: shares?.[i] ?? 1 }],
  );
  if (kept.length === 0) return null;
  const product = kept.reduce((a, { p }) => a * (1 + p / 100), 1);
  if (product < 0) return null; // a ≤ −100% period → undefined
  const n = shares ? periodsCovered(kept.map((k) => k.w)) : kept.length;
  return (Math.pow(product, 1 / n) - 1) * 100;
}

/** A point label's time: "YYYY-MM-DD" or "YYYY-MM-DDTHH" (UTC). */
export const labelMs = (label: string) =>
  Date.parse(label.length > 10 ? `${label}:00:00Z` : `${label}T00:00:00Z`);

/** Where a point label's own bucket ends: the next hour, or the next day. */
export const labelEndMs = (label: string) =>
  labelMs(label) + (label.length > 10 ? 3_600_000 : 86_400_000);
