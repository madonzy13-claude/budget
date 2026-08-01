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
  /** The month's spend, split by where it came from: the limit, the reserve it
   *  drew, and the overspend. The three sum to the month's TOTAL spend, which is
   *  what the colour proportions are measured against — `real` is the running
   *  total at this point, which in a daily bucket is only part of it. */
  withinLimit?: number;
  reserveUsed?: number;
  overspent?: number;
  [key: string]: unknown;
}

/**
 * A reserve draw or an overspend gets a FLOOR of five points added to its share
 * of the line, taken out of green (260801 user decision): a 3% sliver of yellow
 * is invisible, and those are precisely the jumps worth seeing. Zero parts stay
 * zero — a month that never touched its reserve shows no yellow at all.
 */
export const ZONE_BOOST = 0.05;

/**
 * Where the colour changes, in VALUE space: green below `limit`, yellow up to
 * `covered`, red above. Boosted as above, so these are display thresholds — the
 * true amounts stay in the tooltip.
 */
export function zoneThresholds(r: ActualRow): {
  limit: number;
  covered: number;
} {
  const real = Number(r.real);
  if (!(real > 0)) return { limit: 0, covered: 0 };
  const within = Number(r.withinLimit ?? 0);
  const used = Number(r.reserveUsed ?? 0);
  // Allocate what has been spent SO FAR in the order money is drawn — the same
  // split the tooltip reports. Using the month's final parts instead turned the
  // line yellow days before any reserve had actually been drawn (user report).
  const drawn = Math.min(Math.max(real - within, 0), used);
  const over = Math.max(real - within - used, 0);

  let yellow = drawn > 0 ? drawn / real + ZONE_BOOST : 0;
  let red = over > 0 ? over / real + ZONE_BOOST : 0;
  const nonGreen = yellow + red;
  if (nonGreen > 1) {
    yellow /= nonGreen;
    red /= nonGreen;
  }
  const green = 1 - yellow - red;
  return { limit: real * green, covered: real * (green + yellow) };
}

const limitOf = (r: ActualRow) => zoneThresholds(r).limit;
const coveredOf = (r: ActualRow) => zoneThresholds(r).covered;

export type SpendZone = "under" | "between" | "over";

/**
 * Which part of the month's spend is this point in (260801 user decision)? The
 * month is split by WHERE THE MONEY CAME FROM — limit, then reserve, then
 * overspend — and the line is coloured in exactly those proportions. A value
 * exactly ON a threshold belongs to the lower part: spending the limit to the
 * cent has not touched the reserve.
 */
export function spendZone(r: ActualRow): SpendZone {
  const real = Number(r.real);
  if (real <= limitOf(r)) return "under";
  return real <= coveredOf(r) ? "between" : "over";
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
