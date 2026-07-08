/**
 * overspendHeat — heat-map colour (a CSS token) for how far a category's real
 * average is OVER its planned average, as a percent. Used by the Overview
 * avg/overspend-by-category chart.
 *
 * Thresholds:
 *   ≤ 0%  under / on budget → green  (--trading-up)
 *   ≤ 10% slightly over     → yellow (--primary)
 *   ≤ 25% over              → orange (yellow↔red mix)
 *   > 25% critically over   → red    (--trading-down)
 */
export function overspendHeat(pct: number): string {
  if (pct <= 0) return "var(--trading-up)";
  if (pct <= 10) return "var(--primary)";
  if (pct <= 25)
    return "color-mix(in oklab, var(--primary) 45%, var(--trading-down))";
  return "var(--trading-down)";
}
