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
 * Fritsch–Carlson monotone cubic tangents — the same construction d3-shape's
 * `curveMonotoneX` uses, which is what recharts draws for `type="monotone"`.
 * Solving the crossing on this curve (instead of on straight chords) is what
 * puts the colour change ON the visual intersection.
 */
function monotoneTangents(ys: number[]): number[] {
  const n = ys.length;
  if (n < 2) return new Array(n).fill(0);
  // x steps are 1 (points are evenly spaced on a category axis).
  const slopes = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) slopes[i] = ys[i + 1]! - ys[i]!;
  const m = new Array<number>(n);
  m[0] = slopes[0];
  m[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const a = slopes[i - 1] as number;
    const b = slopes[i] as number;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  // Clamp so the segment can't overshoot (this is what keeps it monotone).
  for (let i = 0; i < n - 1; i++) {
    const d = slopes[i] as number;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }
  return m;
}

/** Cubic Hermite value at local position t∈[0,1] of segment i. */
function hermite(ys: number[], m: number[], i: number, t: number): number {
  const y0 = ys[i]!;
  const y1 = ys[i + 1]!;
  const m0 = m[i]!;
  const m1 = m[i + 1]!;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * m1
  );
}

/**
 * Gradient stops for the actual line: `okColor` while inside the plan,
 * `overColor` past it, with a hard cut at every crossing. Crossings are found on
 * the drawn monotone curves of BOTH series (actual and needs+wants) by bisecting
 * their difference inside the segment where its sign flips.
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

  const reals = rows.map((r) => Number(r.real));
  const plans = rows.map(planOf);
  const realM = monotoneTangents(reals);
  const planM = monotoneTangents(plans);
  const diffAt = (i: number, t: number) =>
    hermite(reals, realM, i, t) - hermite(plans, planM, i, t);

  for (let i = 1; i < rows.length; i++) {
    if (isOverPlan(rows[i - 1]!) === isOverPlan(rows[i]!)) continue;
    // Bisect the segment [i-1, i] for the zero of (actual − plan). 40 halvings
    // is far below one device pixel on any chart width.
    let lo = 0;
    let hi = 1;
    const loSign = Math.sign(diffAt(i - 1, 0));
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (Math.sign(diffAt(i - 1, mid)) === loSign) lo = mid;
      else hi = mid;
    }
    const offset = Math.min(1, Math.max(0, (i - 1 + (lo + hi) / 2) / span));
    // Two stops at the same offset = a hard edge instead of a blend.
    stops.push({ offset, color: colorAt(i - 1) });
    stops.push({ offset, color: colorAt(i) });
  }

  stops.push({ offset: 1, color: colorAt(rows.length - 1) });
  return stops;
}
