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
 * The closing point also carries the old month's RUNNING TOTAL, so the spend
 * holds flat to the boundary and falls at a single x — a 90-degree drop rather
 * than a slide from the month's last spend day.
 *
 * Rows carrying `reset` are geometry, not data: no axis tick, no tooltip.
 */
export interface ResettableRow {
  label: string;
  /** Epoch ms — the chart's x-axis is numeric. */
  ts: number;
  /** null past today — the running month's plan tail claims no spend. */
  real: number | null;
  needs: number;
  wants: number;
  /** Geometry, not a reading: no axis tick, no tooltip. */
  reset?: boolean;
  /** Merely REPEATS the reading before it, to hold the line flat. It answers no
   *  pointer: stopping on it put a second identical tick at every month end. */
  hold?: boolean;
  /** The vertical fall back to zero — the reset line itself. */
  drop?: boolean;
  /** Rows ride straight into recharts, which takes arbitrary keys. */
  [key: string]: unknown;
}

const monthOf = (label: string) => label.slice(0, 7);

export function insertMonthResets<T extends ResettableRow>(
  rows: T[],
): Array<T & { reset?: boolean; hold?: boolean; drop?: boolean }> {
  const out: Array<T & { reset?: boolean; hold?: boolean; drop?: boolean }> =
    [];
  for (const [i, r] of rows.entries()) {
    const prev = rows[i - 1];
    // A MONTHLY point carries its month-END value, so the very first month needs
    // an opening point or it is only ever drawn dropping out of the range. A
    // daily series already starts at the range anchor, which is its own zero.
    const opensRange = i === 0 && r.label.length === 7;
    if (opensRange || (prev && monthOf(prev.label) !== monthOf(r.label))) {
      const label = `${monthOf(r.label)}-01`;
      const ts = Date.parse(`${label}T00:00:00Z`);
      // Close the previous month at ITS limits AND its running total, then open
      // the new one at its own limits and zero — a millisecond apart, so the
      // bands step vertically and the spend falls straight down while the
      // closing point keeps the date and numbers of the month it ENDS.
      // It is a HOLD, not a reading: it repeats the last day of the month, so
      // answering the pointer there gave every month end a second, identical
      // tick (user report, 260802). The month's OPENING point below is its own
      // reading (nothing spent yet) and still answers.
      if (prev)
        out.push({ ...prev, ts: ts - 1, reset: true, hold: true } as T & {
          reset?: boolean;
          hold?: boolean;
          drop?: boolean;
        });
      out.push({ ...r, label, ts, real: 0, reset: true, drop: !!prev });
    }
    out.push(r);
  }
  return out;
}
