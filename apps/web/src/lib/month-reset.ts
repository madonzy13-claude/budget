/**
 * month-reset.ts — the per-month boundary points on the planned timeline (260801).
 *
 * Every month is its own SPEND cycle: the total restarts at zero on the 1st.
 * Drawn without a boundary point the two months are joined by one sliding
 * segment, which reads as June's total continuing into July.
 *
 * The PLAN bands do not reset — a limit is in force all month. They are a step
 * function: the boundary carries a closing point at the old month's limit and an
 * opening point at the new one, both at the same x, so a changed limit steps
 * square instead of sliding diagonally across the boundary.
 *
 * Rows carrying `reset` are geometry, not data: no axis tick, no tooltip.
 */
export interface ResettableRow {
  label: string;
  /** Epoch ms — the chart's x-axis is numeric. */
  ts: number;
  real: number;
  needs: number;
  wants: number;
  reset?: boolean;
}

const monthOf = (label: string) => label.slice(0, 7);

export function insertMonthResets<T extends ResettableRow>(
  rows: T[],
): Array<T & { reset?: boolean }> {
  const out: Array<T & { reset?: boolean }> = [];
  for (const [i, r] of rows.entries()) {
    const prev = rows[i - 1];
    // A MONTHLY point carries its month-END value, so the very first month needs
    // an opening point or it is only ever drawn dropping out of the range. A
    // daily series already starts at the range anchor, which is its own zero.
    const opensRange = i === 0 && r.label.length === 7;
    if (opensRange || (prev && monthOf(prev.label) !== monthOf(r.label))) {
      const label = `${monthOf(r.label)}-01`;
      const ts = Date.parse(`${label}T00:00:00Z`);
      // Close the previous month at ITS limits, then open the new one at its
      // own — same x, so the plan bands step vertically.
      if (prev)
        out.push({ ...prev, label, ts, real: 0, reset: true } as T & {
          reset?: boolean;
        });
      out.push({ ...r, label, ts, real: 0, reset: true });
    }
    out.push(r);
  }
  return out;
}
