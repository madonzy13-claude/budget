/**
 * month-tail.ts — give the RUNNING month its full slot on the timeline (260801).
 *
 * The x-axis is proportional to elapsed time, so a month one day old occupied
 * about 1% of the width: its plan band and its spend were invisible and the
 * chart appeared to end in a stray vertical (user report). A limit is in force
 * for the whole month, so the plan is carried to the month's last day; `real` is
 * null there, which recharts leaves as a gap — no spend is claimed for days that
 * haven't happened.
 */
import type { ResettableRow } from "./month-reset";

export function appendRunningMonthTail<T extends ResettableRow>(
  rows: T[],
  todayIso: string,
): T[] {
  const last = rows[rows.length - 1];
  if (!last) return rows;
  const month = last.label.slice(0, 7);
  if (!todayIso.startsWith(month)) return rows;

  const [y, m] = month.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = Date.parse(
    `${month}-${String(lastDay).padStart(2, "0")}T00:00:00Z`,
  );
  if (monthEnd <= last.ts) return rows;

  return [...rows, { ...last, ts: monthEnd, real: null, reset: true }];
}
