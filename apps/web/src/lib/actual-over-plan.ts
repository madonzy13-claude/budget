/**
 * actual-over-plan.ts — split the ACTUAL spend line at the planned total.
 *
 * The planned-vs-actual chart draws actual in grey while it stays inside the plan
 * (needs + wants) and RED for the stretch that runs past it (260731 user
 * decision). Recharts colours a whole series, not a segment, so the line is split
 * into two keys — `realOk` and `realOver` — each null where the other owns the
 * line. At a crossing BOTH carry the value, so the grey and red pieces meet
 * instead of leaving a gap where the colour changes.
 */
export interface ActualRow {
  real: number;
  needs: number;
  wants: number;
  [key: string]: unknown;
}

export type SplitRow = ActualRow & {
  realOk: number | null;
  realOver: number | null;
};

export function splitActualOverPlan(rows: ActualRow[]): SplitRow[] {
  const out: SplitRow[] = rows.map((r) => {
    const plan = Number(r.needs) + Number(r.wants);
    const real = Number(r.real);
    const over = real > plan;
    return {
      ...r,
      realOk: over ? null : real,
      realOver: over ? real : null,
    };
  });

  // Handshake at every crossing: the point before a colour change joins BOTH
  // series, so the segments share an endpoint.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!;
    const cur = out[i]!;
    if (cur.realOver !== null && prev.realOver === null) {
      prev.realOver = Number(prev.real);
    }
    if (cur.realOk !== null && prev.realOk === null) {
      prev.realOk = Number(prev.real);
    }
  }
  return out;
}
