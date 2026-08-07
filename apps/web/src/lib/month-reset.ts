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
 * The month's LAST READING is MOVED onto the boundary rather than copied there.
 * It keeps its own date and figures — it is still that day's reading, drawn at the
 * moment the month ends — so the line rises straight into the boundary and the
 * fall is a 90-degree drop from where it arrives. Three attempts got here
 * (260802): a copy gave the month end two stops with identical numbers ("extra
 * tick"); cutting the line at the reading put the fall mid-month wherever the
 * spend was logged mid-month; drawing the line to the boundary while the reading
 * stayed put left the stop, and the hover dot, adrift from the line ("no tooltip
 * is shown in the end").
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
  /** The vertical fall back to zero — the reset line itself. */
  drop?: boolean;
  /** Rows ride straight into recharts, which takes arbitrary keys. */
  [key: string]: unknown;
}

const monthOf = (label: string) => label.slice(0, 7);

export function insertMonthResets<T extends ResettableRow>(
  rows: T[],
): Array<T & { reset?: boolean; drop?: boolean }> {
  const out: Array<T & { reset?: boolean; drop?: boolean }> = [];
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
      // bands step vertically and the spend falls straight down.
      //
      // The close is the previous month's last reading MOVED here, not a copy of
      // it: it keeps its date and numbers, so the pointer finds one stop at the
      // month end rather than two identical ones, and the hover dot lands on the
      // line instead of back where the reading was logged.
      if (prev) out[out.length - 1] = { ...prev, ts: ts - 1 };
      // The daily series already opens each month with its own `YYYY-MM-01 = 0`.
      // Inserting another put THREE points on the boundary, two at the identical
      // instant, so the pointer stepped twice within one pixel and the middle
      // step — being geometry — answered nothing (user report, 260802: "two
      // steps, one with tooltip and one is without"). Flag that row as the
      // fall's foot instead of twinning it.
      if (r.label === label && Number(r.real) === 0) {
        out.push({ ...r, drop: !!prev });
        continue;
      }
      // No such row in the series (a monthly bucket opening the range): make one.
      // `reset` keeps it off the axis — it is not a day the data has — but it
      // still answers the pointer, because a step that answers nothing reads as
      // a broken chart (user report, 260802).
      out.push({ ...r, label, ts, real: 0, reset: true, drop: !!prev });
    }
    out.push(r);
  }
  return out;
}
