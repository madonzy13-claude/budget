import type { RangePreset } from "./overview-range";

export interface GrowStat {
  delta_cents: string;
  delta_pct: number | null;
}

/**
 * Pick the growth stat that matches the RENDERED value chart.
 *
 * The "all" preset trims leading zero-value buckets, so its chart starts at the
 * first REAL snapshot, not the $0 edge — the growth must anchor there: `grow`
 * (first-real → last), whose % is defined. Every other preset seeds the chart
 * with the opening value, so `grow_from_open` (opening → last) is what the line
 * draws. Without this branch, "all" showed the pre-trim $0 baseline: an empty %
 * and an amount equal to the whole end value instead of the visible rise.
 */
export function selectRangeGrowth(
  preset: RangePreset,
  data: { grow: GrowStat; grow_from_open?: GrowStat | null },
): GrowStat {
  if (preset === "all") return data.grow;
  return data.grow_from_open ?? data.grow;
}
