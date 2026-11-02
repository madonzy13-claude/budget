import type { RangePreset } from "./overview-range";
import { cumulativeReturnPct, type InvestPoint } from "./investment-return";

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

export interface RangeInvestMetrics {
  totalDelta: number;
  totalPct: number | null;
  plDelta: number;
  plPct: number | null;
  contribDelta: number;
  contribPct: number | null;
}

/** The chart's points as value + P/L (`exclByLabel` = value net of contributions). */
export function investPoints(
  points: readonly { label: string; value_cents: string }[],
  exclByLabel: ReadonlyMap<string, number>,
): InvestPoint[] {
  return points.map((p) => ({
    label: p.label,
    value: Number(p.value_cents),
    pl: exclByLabel.get(p.label) ?? 0,
  }));
}

/**
 * The investments view's three range metrics, first rendered tick → last
 * (budget Overview and the all-budgets trend share this):
 *   Total         = value(last) − value(first), % of the start value.
 *   P/L           = profit(last) − profit(first); % = the INVESTMENT RETURN
 *                   over the range (lib/investment-return, 261102).
 *   Contributions = contributions(last) − contributions(first), % of the start.
 */
export function rangeInvestMetrics(
  points: readonly { label: string; value_cents: string }[],
  exclByLabel: ReadonlyMap<string, number>,
): RangeInvestMetrics | null {
  if (points.length === 0) return null;
  const pts = investPoints(points, exclByLabel);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const cFirst = first.value - first.pl;
  const contribDelta = last.value - last.pl - cFirst;
  return {
    totalDelta: Math.round(last.value - first.value),
    totalPct:
      first.value !== 0
        ? (100 * (last.value - first.value)) / first.value
        : null,
    plDelta: Math.round(last.pl - first.pl),
    plPct: first.value > 0 ? cumulativeReturnPct(pts).at(-1)! : null,
    contribDelta: Math.round(contribDelta),
    contribPct: cFirst !== 0 ? (100 * contribDelta) / cFirst : null,
  };
}
