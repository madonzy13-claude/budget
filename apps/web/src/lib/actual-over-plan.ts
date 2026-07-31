/**
 * actual-over-plan.ts — colour the ACTUAL line by where it crosses the plan.
 *
 * Chart.js solves this with per-segment styling (`segment.borderColor`), which
 * paints a whole point-to-point segment from its endpoints — so the colour flips
 * a full step early. Recharts has no segment API at all, but SVG gives us
 * something better: one line stroked with a horizontal gradient whose stops are
 * HARD (two stops at the same offset), placed at the INTERPOLATED crossing. The
 * colour then changes exactly where actual meets needs + wants, at any point
 * density, and the filled area underneath stays a single calm grey.
 *
 * Offsets are in x-fraction space (0 = first point, 1 = last), which is what a
 * category axis with evenly spaced points gives us.
 */
export interface ActualRow {
  real: number;
  needs: number;
  wants: number;
  [key: string]: unknown;
}

export interface GradientStop {
  offset: number;
  color: string;
}

const planOf = (r: ActualRow) => Number(r.needs) + Number(r.wants);

/** Is this point spending past its plan? (Exactly on the plan is still inside.) */
export function isOverPlan(r: ActualRow): boolean {
  return Number(r.real) > planOf(r);
}

/**
 * Gradient stops for the actual line: `okColor` while inside the plan,
 * `overColor` past it, with a hard cut at every crossing.
 */
export function overPlanGradientStops(
  rows: ActualRow[],
  okColor: string,
  overColor: string,
): GradientStop[] {
  if (rows.length === 0) return [];
  const colorAt = (i: number) => (isOverPlan(rows[i]!) ? overColor : okColor);
  const stops: GradientStop[] = [{ offset: 0, color: colorAt(0) }];
  const span = Math.max(1, rows.length - 1);

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (isOverPlan(prev) === isOverPlan(cur)) continue;

    // Where inside [i-1, i] does (real − plan) hit zero? Both series may move,
    // so solve on their DIFFERENCE; a zero denominator can't happen here (the
    // sign changed), but guard anyway and fall back to the segment start.
    const d0 = Number(prev.real) - planOf(prev);
    const d1 = Number(cur.real) - planOf(cur);
    const denom = d1 - d0;
    const f = denom === 0 ? 0 : Math.min(1, Math.max(0, -d0 / denom));
    const offset = Math.min(1, Math.max(0, (i - 1 + f) / span));

    // Two stops at the same offset = a hard edge instead of a blend.
    stops.push({ offset, color: colorAt(i - 1) });
    stops.push({ offset, color: colorAt(i) });
  }

  stops.push({ offset: 1, color: colorAt(rows.length - 1) });
  return stops;
}
