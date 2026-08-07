/**
 * sector-corner.ts — the corner radius a pie sector can actually carry (260804).
 *
 * The pies ask for 6px rounded ends. recharts drops the rounding ENTIRELY when a
 * sector is too small to fit it, so once the minimum-angle floor started
 * producing thin slices, those slices rendered as bare wedges beside rounded
 * neighbours (user screenshot). Shrinking the radius to fit keeps every slice in
 * the same visual language instead of some being square.
 *
 * Two limits: half the inner arc (or the two corners meet and cross) and half
 * the band's thickness.
 */
export interface SectorGeometry {
  /** Degrees, as recharts hands them over — may run either direction. */
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
}

export function sectorCornerRadius(
  { startAngle, endAngle, innerRadius, outerRadius }: SectorGeometry,
  base: number,
): number {
  const span = Math.abs(endAngle - startAngle);
  if (![span, innerRadius, outerRadius].every((n) => Number.isFinite(n))) {
    return 0;
  }
  const innerArc = (span * Math.PI * innerRadius) / 180;
  const thickness = Math.abs(outerRadius - innerRadius);
  return Math.max(0, Math.min(base, innerArc / 2, thickness / 2));
}
