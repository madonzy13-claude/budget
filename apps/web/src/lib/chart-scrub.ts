/**
 * chart-scrub.ts — the maths behind the wealth charts' own pointer handling
 * (261102, user): which point the pointer is over, where each line sits there,
 * and the investment return between two points of a range.
 */

/** Index of the x closest to `x` (xs ascending); past either end → that end. */
export function nearestIndex(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(xs[hi]! - x) < Math.abs(x - xs[lo]!) ? hi : lo;
}

/**
 * The value each series is DRAWN at in `row`: a stacked series sits on top of
 * the ones stacked before it. Series with no value there are left out.
 */
export function seriesTops(
  row: Record<string, unknown>,
  series: readonly { key: string; stack?: string }[],
): Record<string, number> {
  const stacks = new Map<string, number>();
  const out: Record<string, number> = {};
  for (const s of series) {
    const v = row[s.key];
    if (v == null) continue;
    const base = s.stack ? (stacks.get(s.stack) ?? 0) : 0;
    const top = base + Number(v);
    if (s.stack) stacks.set(s.stack, top);
    out[s.key] = top;
  }
  return out;
}

/** Return % between two points, from each one's return % since range start. */
export function returnBetween(fromPct: number, toPct: number): number {
  return ((1 + toPct / 100) / (1 + fromPct / 100) - 1) * 100;
}
