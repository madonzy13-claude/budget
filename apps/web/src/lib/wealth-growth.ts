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

export interface RangeInvestMetrics {
  totalDelta: number;
  totalPct: number | null;
  plDelta: number;
  plPct: number | null;
  contribDelta: number;
  contribPct: number | null;
}

/**
 * The investments view's three range metrics, first rendered tick → last
 * (budget Overview and the all-budgets trend share this):
 *   Total         = value(last) − value(first), % of the start value.
 *   P/L           = profit(last) − profit(first), % of the money at work over
 *                   the range: start value + contributions added, which is
 *                   value(last) − P/L gained. Dividing by the contributions at
 *                   the START read +625% for "All" on a real budget that began
 *                   with 74k and added 480k over the years (261102).
 *   Contributions = contributions(last) − contributions(first), % of the start.
 * `exclByLabel` = profit (value net of contributions) per point label.
 */
export function rangeInvestMetrics(
  points: readonly { label: string; value_cents: string }[],
  exclByLabel: ReadonlyMap<string, number>,
): RangeInvestMetrics | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const vFirst = Number(first.value_cents);
  const vLast = Number(last.value_cents);
  const pFirst = exclByLabel.get(first.label) ?? 0;
  const pLast = exclByLabel.get(last.label) ?? 0;
  const cFirst = vFirst - pFirst;
  const plDelta = pLast - pFirst;
  const atWork = vLast - plDelta;
  return {
    totalDelta: Math.round(vLast - vFirst),
    totalPct: vFirst !== 0 ? (100 * (vLast - vFirst)) / vFirst : null,
    plDelta: Math.round(plDelta),
    plPct: atWork > 0 ? (100 * plDelta) / atWork : null,
    contribDelta: Math.round(vLast - pLast - cFirst),
    contribPct: cFirst !== 0 ? (100 * (vLast - pLast - cFirst)) / cFirst : null,
  };
}
