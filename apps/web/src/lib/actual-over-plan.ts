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
  [key: string]: unknown;
}

export interface GradientStop {
  offset: number;
  color: string;
}

const planOf = (r: ActualRow) => Number(r.needs) + Number(r.wants);

export type SpendZone = "under" | "between" | "over";

/**
 * Which band is this point in? A value exactly ON a line still belongs to the
 * lower band — spending your needs budget to the cent is not "into wants".
 */
export function spendZone(r: ActualRow): SpendZone {
  const real = Number(r.real);
  if (real <= Number(r.needs)) return "under";
  return real <= planOf(r) ? "between" : "over";
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

/** How many samples per segment when hunting for zone changes. A segment can
 *  cross BOTH the needs line and the total line, so a single sign test is not
 *  enough; sampling then bisecting finds every transition. */
const SAMPLES_PER_SEGMENT = 24;
const BISECT_STEPS = 30;

/**
 * Gradient stops for the actual line, one colour per zone with a hard cut at each
 * crossing. Both plan lines are evaluated on their own monotone curves, the same
 * ones recharts paints, so a cut lands on the visual intersection.
 */
export function planZoneGradientStops(
  rows: ActualRow[],
  colors: { under: string; between: string; over: string },
): GradientStop[] {
  if (rows.length === 0) return [];
  const span = Math.max(1, rows.length - 1);
  const reals = rows.map((r) => Number(r.real));
  const needs = rows.map((r) => Number(r.needs));
  const plans = rows.map(planOf);
  const realM = monotoneTangents(reals);
  const needsM = monotoneTangents(needs);
  const plansM = monotoneTangents(plans);

  /** Zone at global position x∈[0, rows.length-1], on the DRAWN curves. */
  const zoneAt = (x: number): SpendZone => {
    const i = Math.min(rows.length - 2, Math.max(0, Math.floor(x)));
    const t = rows.length < 2 ? 0 : x - i;
    const real = hermite(reals, realM, i, t);
    const need = hermite(needs, needsM, i, t);
    const plan = hermite(plans, plansM, i, t);
    if (real <= need) return "under";
    return real <= plan ? "between" : "over";
  };

  const colorOf = (z: SpendZone) => colors[z];
  if (rows.length === 1) {
    const only = colorOf(spendZone(rows[0]!));
    return [
      { offset: 0, color: only },
      { offset: 1, color: only },
    ];
  }

  const stops: GradientStop[] = [{ offset: 0, color: colorOf(zoneAt(0)) }];
  let prevX = 0;
  let prevZone = zoneAt(0);
  const step = 1 / SAMPLES_PER_SEGMENT;

  for (let x = step; x <= span + 1e-9; x += step) {
    const cur = Math.min(span, x);
    const zone = zoneAt(cur);
    if (zone === prevZone) {
      prevX = cur;
      continue;
    }
    // Bisect [prevX, cur] for the exact position where the zone flips.
    let lo = prevX;
    let hi = cur;
    for (let k = 0; k < BISECT_STEPS; k++) {
      const mid = (lo + hi) / 2;
      if (zoneAt(mid) === prevZone) lo = mid;
      else hi = mid;
    }
    const offset = Math.min(1, Math.max(0, (lo + hi) / 2 / span));
    // Two stops at the same offset = a hard edge instead of a blend.
    stops.push({ offset, color: colorOf(prevZone) });
    stops.push({ offset, color: colorOf(zone) });
    prevZone = zone;
    prevX = cur;
  }

  stops.push({ offset: 1, color: colorOf(zoneAt(span)) });
  return stops;
}
