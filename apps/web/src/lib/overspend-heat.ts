/**
 * overspendHeat — heat-map colour (a CSS token) for a category's real-vs-planned
 * average variance, as a percent (positive = overspent, negative = underspent).
 * Used by the Overview avg/overspend-by-category chart.
 *
 * Thresholds:
 *   > +10% overspent        → red    (--trading-down)
 *   < −10% underspent       → yellow (--primary)
 *   within ±10% (on track)  → green  (--trading-up)
 */
export function overspendHeat(pct: number): string {
  if (pct > 10) return "var(--trading-down)";
  if (pct < -10) return "var(--primary)";
  return "var(--trading-up)";
}
