/**
 * actual-over-plan.ts — colour the ACTUAL line by which plan band it sits in.
 *
 * Three zones (260801): below NEEDS, between needs and needs+wants, and past the
 * whole plan. Chart.js solves this with per-segment styling
 * (`segment.borderColor`), which paints a whole point-to-point segment from its
 * endpoints — so the colour flips a full step early. Recharts has no segment API
 * at all, but SVG gives us something better: one line stroked with a horizontal
 * gradient whose stops are HARD (two at the same offset), placed at the real
 * crossings — solved on the SAME monotone cubic recharts draws, so the colour
 * changes exactly where the curves meet.
 *
 * Offsets are in x-fraction space (0 = first point, 1 = last), which is what a
 * category axis with evenly spaced points gives us.
 */
export interface ActualRow {
  real: number;
  needs: number;
  wants: number;
  /** Reserve available that month — spending inside it is covered, not over. */
  reserve?: number;
  [key: string]: unknown;
}

const planOf = (r: ActualRow) => Number(r.needs) + Number(r.wants);

export type SpendZone = "under" | "between" | "over";

/**
 * Which band is this point in (260801 user decision)? Inside the plan is green,
 * covered by that month's reserve is yellow, past both is red. A value exactly ON
 * a line still belongs to the lower band — spending the plan to the cent has not
 * touched the reserve.
 */
export function spendZone(r: ActualRow): SpendZone {
  const real = Number(r.real);
  const plan = planOf(r);
  if (real <= plan) return "under";
  return real <= plan + Number(r.reserve ?? 0) ? "between" : "over";
}

/** Is this point spending past the WHOLE plan? (Kept for the tooltip colour.) */
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
 * Sample a series along the drawn shape: index-space positions with their values.
 * `linear` traces straight segments, otherwise the monotone cubic recharts draws.
 * Used by the zone renderer to build pixel paths that match the chart exactly.
 */
export function sampleSeries(
  values: number[],
  opts: { linear?: boolean; perSegment?: number } = {},
): Array<{ x: number; v: number }> {
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: 0, v: values[0]! }];
  const m = monotoneTangents(values);
  const per = Math.max(1, opts.perSegment ?? (opts.linear ? 1 : 12));
  const out: Array<{ x: number; v: number }> = [];
  for (let i = 0; i < values.length - 1; i++) {
    for (let k = 0; k < per; k++) {
      const t = k / per;
      out.push({
        x: i + t,
        v: opts.linear
          ? values[i]! + (values[i + 1]! - values[i]!) * t
          : hermite(values, m, i, t),
      });
    }
  }
  out.push({ x: values.length - 1, v: values[values.length - 1]! });
  return out;
}
