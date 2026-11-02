/**
 * Investments "Average change" bars — Contributions · P/L · Total per period.
 *
 * Inputs are the server's dynamics for the total value series and the net
 * (value − contributions) series, each { pct = Δ ÷ own start, delta }.
 * - Total: as served.
 * - P/L: ΔP/L ÷ the period's starting VALUE — a return. The net series' own pct
 *   (ΔP/L ÷ P/L-at-start) is profit growth, and a small starting profit blew it
 *   up (+472% for a +41% year).
 * - Contributions: Δcontrib ÷ contributions at start (= value − P/L at start).
 */
export interface DynPoint {
  label: string;
  pct: number | null;
  delta: number;
}

export type ChangeBarRow = {
  label: string;
  total: number;
  totalDelta: number;
  pl: number;
  plDelta: number;
  contrib: number;
  contribDelta: number;
};

/** Geometric mean of per-period %s — growth compounds. */
export function geoMean(pcts: (number | null)[]): number | null {
  const nn = pcts.filter((p): p is number => p !== null);
  if (nn.length === 0) return null;
  const product = nn.reduce((a, p) => a * (1 + p / 100), 1);
  if (product < 0) return null; // a ≤ −100% period → undefined
  return (Math.pow(product, 1 / nn.length) - 1) * 100;
}

const baseOf = (delta: number, pct: number | null) =>
  pct != null && pct !== 0 ? (delta * 100) / pct : null;

export function combineChangeBars(total: DynPoint[], pl: DynPoint[]) {
  const plByLabel = new Map(pl.map((d) => [d.label, d]));
  const plPcts: (number | null)[] = [];
  const contribPcts: (number | null)[] = [];
  const rows: ChangeBarRow[] = total.map((d) => {
    const p = plByLabel.get(d.label);
    const plDelta = p?.delta ?? 0;
    const contribDelta = d.delta - plDelta;
    const totalBase = baseOf(d.delta, d.pct);
    const plStart = baseOf(plDelta, p?.pct ?? null);
    const plPct =
      totalBase != null && totalBase !== 0 ? (plDelta * 100) / totalBase : null;
    const contribBase =
      totalBase != null && plStart != null ? totalBase - plStart : null;
    const contribPct =
      contribBase != null && contribBase !== 0
        ? (contribDelta * 100) / contribBase
        : null;
    plPcts.push(plPct);
    contribPcts.push(contribPct);
    return {
      label: d.label,
      total: d.pct ?? 0,
      totalDelta: d.delta,
      pl: plPct ?? 0,
      plDelta,
      contrib: contribPct ?? 0,
      contribDelta: Math.round(contribDelta),
    };
  });
  return {
    rows,
    avg: {
      contrib: geoMean(contribPcts),
      pl: geoMean(plPcts),
      total: geoMean(total.map((d) => d.pct)),
    },
  };
}
