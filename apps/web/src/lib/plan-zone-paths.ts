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
