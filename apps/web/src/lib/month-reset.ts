/**
 * month-reset.ts — the per-month reset point on the planned timeline (260801).
 *
 * Every month is its own cycle: the spend restarts at zero on the 1st and the
 * plan is that month's own limit. Drawn without a boundary point the two months
 * are joined by one sliding segment, which reads as June's total continuing into
 * July. A zero row at the month's first day makes both the grey plan bands and
 * the spend line DROP at the boundary, so each month stands as its own shape.
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
    // its zero too or it is only ever drawn dropping out of the range. A daily
    // series already starts at the range anchor, which is its own zero.
    const opensRange = i === 0 && r.label.length === 7;
    if (opensRange || (prev && monthOf(prev.label) !== monthOf(r.label))) {
      const first = `${monthOf(r.label)}-01`;
      out.push({
        ...r,
        label: first,
        ts: Date.parse(`${first}T00:00:00Z`),
        real: 0,
        needs: 0,
        wants: 0,
        reset: true,
      });
    }
    out.push(r);
  }
  return out;
}
