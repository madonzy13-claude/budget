/**
 * plan-zone-paths.ts — the drawn line, in SVG (260801).
 *
 * The zone regions that used to live here are gone: the line is CUT at its
 * crossings and each piece stroked in one colour (see actual-over-plan's
 * zoneSegments), because clipping copies of one line to three regions painted
 * two colours wherever the line ran within a stroke-width of a boundary.
 *
 * All coordinates are pixels in the chart's own space, where y grows DOWNWARD: a
 * smaller y is a larger value.
 */
export interface Pt {
  x: number;
  y: number;
}

const pts = (points: Pt[]) => points.map((p) => `L${p.x},${p.y}`).join("");

/** Open path through the points (the line itself). */
export function polylinePath(points: Pt[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M${first!.x},${first!.y}${pts(rest)}`;
}

/**
 * Draw a month's LAST READING at the month's end (260802 user decision).
 *
 * A `hold` row repeats that reading at the boundary so the line reaches the month
 * end — but drawn as its own point it showed as a flat stub hanging off the last
 * spending day ("this small ending"). Ending the line at the reading instead put
 * the fall mid-month wherever the spend was logged mid-month. Moving the reading
 * itself onto the boundary gives neither: the line rises straight into the month
 * end, and the reset falls from exactly where it arrives — no tail, no gap.
 *
 * Takes the x of every row and returns them with each pre-hold reading slid onto
 * its hold's x. The hold itself is then skipped when the line is built.
 */
export function holdXsAtBoundary(
  rows: ReadonlyArray<{ hold?: unknown }>,
  xs: readonly number[],
): number[] {
  const out = [...xs];
  for (const [i, r] of rows.entries()) {
    if (r.hold && i > 0) out[i - 1] = xs[i]!;
  }
  return out;
}
