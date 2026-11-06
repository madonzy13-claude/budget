/**
 * P/L % in every investments view is the INVESTMENT RETURN (261102, user): what
 * the invested money earned. Each step earns its P/L change on the VALUE held
 * before it, and steps chain — so a deposit is never a gain and its timing
 * never skews the %. Brokers call this the time-weighted return.
 *
 *   step factor = 1 + (P/L now − P/L before) ÷ value before
 *
 * Shared by the budget Overview and the all-budgets trend: the header (whole
 * range), the tooltip (range start → hovered point) and the change bars.
 */
import {
  geoMean,
  labelEndMs,
  labelMs,
  periodShare,
  periodsCovered,
  type ChangeBarRow,
} from "./change-bars";

export interface InvestPoint {
  label: string;
  /** Investment value at this point. */
  value: number;
  /** P/L at this point = value − contributions. */
  pl: number;
}

function stepFactor(prev: InvestPoint | undefined, cur: InvestPoint): number {
  if (!prev || prev.value <= 0) return 1;
  return 1 + (cur.pl - prev.pl) / prev.value;
}

/** Return % from the first point up to each point (the first is 0). */
export function cumulativeReturnPct(points: readonly InvestPoint[]): number[] {
  let f = 1;
  return points.map((cur, i) => {
    f *= stepFactor(points[i - 1], cur);
    return (f - 1) * 100;
  });
}

/**
 * Contributions · P/L · Total per period. A period owns the steps that END in
 * it, so it starts where the previous period ended (the first starts at the
 * first point) — periods chain exactly into the range return, and the P/L
 * average compounds to it.
 */
export function investChangeBars(
  points: readonly InvestPoint[],
  periodOf: (label: string) => string,
): {
  rows: ChangeBarRow[];
  avg: { contrib: number | null; pl: number | null; total: number | null };
  /** Average money change per period, partial years weighed like `avg`. */
  avgDelta: { contrib: number; pl: number; total: number };
} {
  const rows: ChangeBarRow[] = [];
  const plPcts: (number | null)[] = [];
  const totalPcts: (number | null)[] = [];
  const contribPcts: (number | null)[] = [];
  const shares: number[] = [];
  const firstMs = points.length ? labelMs(points[0]!.label) : 0;
  const lastMs = points.length ? labelEndMs(points.at(-1)!.label) : 0;
  let i = 0;
  while (i < points.length) {
    const label = periodOf(points[i]!.label);
    const start = points[i - 1] ?? points[i]!;
    let factor = 1;
    let end = points[i]!;
    for (; i < points.length && periodOf(points[i]!.label) === label; i++) {
      factor *= stepFactor(points[i - 1], points[i]!);
      end = points[i]!;
    }
    const totalDelta = end.value - start.value;
    const plDelta = end.pl - start.pl;
    const contribDelta = totalDelta - plDelta;
    const contribStart = start.value - start.pl;
    const total = start.value !== 0 ? (100 * totalDelta) / start.value : null;
    const pl = start.value > 0 ? (factor - 1) * 100 : null;
    const contrib =
      contribStart !== 0 ? (100 * contribDelta) / contribStart : null;
    totalPcts.push(total);
    plPcts.push(pl);
    contribPcts.push(contrib);
    shares.push(periodShare(label, firstMs, lastMs));
    rows.push({
      label,
      total: total ?? 0,
      totalDelta: Math.round(totalDelta),
      pl: pl ?? 0,
      plDelta: Math.round(plDelta),
      contrib: contrib ?? 0,
      contribDelta: Math.round(contribDelta),
    });
  }
  const meanDelta = (key: "contribDelta" | "plDelta" | "totalDelta") =>
    rows.length === 0
      ? 0
      : Math.round(
          rows.reduce((s, r) => s + r[key], 0) / periodsCovered(shares),
        );
  return {
    rows,
    avg: {
      contrib: geoMean(contribPcts, shares),
      pl: geoMean(plPcts, shares),
      total: geoMean(totalPcts, shares),
    },
    avgDelta: {
      contrib: meanDelta("contribDelta"),
      pl: meanDelta("plDelta"),
      total: meanDelta("totalDelta"),
    },
  };
}
