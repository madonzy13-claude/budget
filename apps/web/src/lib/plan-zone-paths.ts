/**
 * plan-zone-paths.ts — SVG regions for the three plan zones (260801).
 *
 * The actual line is coloured by which band it is in. A stroke gradient can only
 * split it along a straight boundary — vertical, in x — so wherever a limit line
 * is sloped, the colour change met it at the wrong angle. Instead the line is
 * drawn once per colour and each copy is CLIPPED to its zone region, which makes
 * the boundary the limit line itself at any slope.
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

/** Everything ABOVE a line (values greater than it), up to the plot's top edge. */
export function regionAbove(points: Pt[], top: number): string {
  if (points.length === 0) return "";
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${polylinePath(points)}L${last.x},${top}L${first.x},${top}Z`;
}

/** Everything BELOW a line, down to the plot's bottom edge. */
export function regionBelow(points: Pt[], bottom: number): string {
  if (points.length === 0) return "";
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${polylinePath(points)}L${last.x},${bottom}L${first.x},${bottom}Z`;
}

/** The band between two lines — `upper` is the higher value (smaller y). */
export function regionBetween(upper: Pt[], lower: Pt[]): string {
  if (upper.length === 0 || lower.length === 0) return "";
  const back = [...lower].reverse();
  return `${polylinePath(upper)}${pts(back)}Z`;
}
