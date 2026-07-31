/**
 * actual-over-plan.ts — mark the stretch where ACTUAL runs past the plan.
 *
 * The planned-vs-actual chart keeps ONE grey actual area (so the filled shape
 * under the line never changes colour) and draws a RED STROKE on top of the
 * stretch that exceeds the plan (needs + wants) — 260731 user decision, round 2:
 * filling the over-plan half from the baseline painted a red slab across half the
 * chart, which is not what "the line piece is red" means.
 *
 * `realOver` is null wherever actual is inside the plan; at a crossing it also
 * carries the neighbouring point so the red stroke starts/ends ON the line
 * instead of leaving a gap.
 */
export interface ActualRow {
  real: number;
  needs: number;
  wants: number;
  [key: string]: unknown;
}

export type SplitRow = ActualRow & { realOver: number | null };

export function splitActualOverPlan(rows: ActualRow[]): SplitRow[] {
  const out: SplitRow[] = rows.map((r) => {
    const plan = Number(r.needs) + Number(r.wants);
    const real = Number(r.real);
    return { ...r, realOver: real > plan ? real : null };
  });

  // Handshake at each crossing: the point on the other side joins the red series
  // too, so the segments meet on the line.
  const overFlags = out.map((r) => r.realOver !== null);
  for (let i = 0; i < out.length; i++) {
    if (overFlags[i]) continue;
    const prevOver = i > 0 && overFlags[i - 1];
    const nextOver = i + 1 < out.length && overFlags[i + 1];
    if (prevOver || nextOver) out[i]!.realOver = Number(out[i]!.real);
  }
  return out;
}
