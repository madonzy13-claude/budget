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
 * A reserve draw or an overspend that exists gets AT LEAST this share of the
 * line (260801): a 3% sliver is invisible, and those are precisely the jumps
 * worth seeing. Zero parts stay zero — a month that never touched its reserve
 * shows no yellow at all.
 *
 * It is a floor, not a bonus. Adding five points to every part moved the cut
 * below the real crossing even where the part was already plain to see, so a
 * point the tooltip reported as wholly within the limit was drawn yellow (user
 * report). Now only a part too small to see moves anything.
 */
export const ZONE_MIN_SHARE = 0.05;

/**
 * Where the colour changes, in VALUE space: green below `limit`, yellow up to
 * `covered`, red above. Boosted as above, so these are display thresholds — the
 * true amounts stay in the tooltip.
 */
export function zoneThresholds(r: ActualRow): {
  limit: number;
  covered: number;
} {
  const within = Number(r.withinLimit ?? 0);
  const used = Number(r.reserveUsed ?? 0);
  const over = Number(r.overspent ?? 0);
  // The thresholds are the month's own totals, flat across it: the line crosses
  // into yellow exactly where the money stopped coming from the limit. Deriving
  // them from each point's running total instead made the boundary climb with
  // the line, which the line then outran — a whole month drawn in one colour.
  const total = within + used + over;
  if (!(total > 0)) return { limit: 0, covered: 0 };

  let yellow = used > 0 ? Math.max(used / total, ZONE_MIN_SHARE) : 0;
  let red = over > 0 ? Math.max(over / total, ZONE_MIN_SHARE) : 0;
  const nonGreen = yellow + red;
  if (nonGreen > 1) {
    yellow /= nonGreen;
    red /= nonGreen;
  }
  const green = 1 - yellow - red;
  return { limit: total * green, covered: total * (green + yellow) };
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

export interface ZoneSegment {
  zone: SpendZone;
  /** Fractional row index + value — the caller maps them to pixels. */
  points: Array<{ x: number; v: number }>;
}

/**
 * The line cut into single-coloured pieces at its exact crossings (260801).
 *
 * Clipping three copies of the line to three regions painted TWO colours wherever
 * the line ran within a stroke-width of a boundary — the flat top of a month that
 * spent its whole reserve came out green and red at once (user report). Splitting
 * the polyline instead gives every piece exactly one colour.
 *
 * Segments leading into a `drop` row are the month reset, drawn separately in grey.
 * A `hold` row only repeats the month's last reading so the plan bands stay square
 * across the boundary; running the spend line into it drew a short horizontal stub
 * past the last day of every month (user report, 260802).
 */
export function zoneSegments(rows: ActualRow[]): ZoneSegment[] {
  const out: ZoneSegment[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (b.drop || b.hold) continue;
    // Both ends of a segment sit in the same month, so either row's thresholds
    // describe it; the opening row of a month carries that month's.
    const t = zoneThresholds(b);
    const va = Number(a.real);
    const vb = Number(b.real);
    const cuts = [t.limit, t.covered]
      .filter((c) => (c - va) * (c - vb) < 0)
      .sort((p, q) => (vb >= va ? p - q : q - p));
    let x0 = i;
    let v0 = va;
    for (const c of cuts) {
      const x = i + (c - va) / (vb - va);
      out.push({
        zone: zoneOfValue((v0 + c) / 2, t),
        points: [
          { x: x0, v: v0 },
          { x, v: c },
        ],
      });
      x0 = x;
      v0 = c;
    }
    out.push({
      zone: zoneOfValue((v0 + vb) / 2, t),
      points: [
        { x: x0, v: v0 },
        { x: i + 1, v: vb },
      ],
    });
  }
  return out;
}

function zoneOfValue(
  v: number,
  t: { limit: number; covered: number },
): SpendZone {
  if (v <= t.limit) return "under";
  return v <= t.covered ? "between" : "over";
}
