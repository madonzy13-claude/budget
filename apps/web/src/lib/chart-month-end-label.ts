/**
 * chart-month-end-label.ts — expand a monthly chart label to the DAY it stands for.
 *
 * A monthly bucket point carries the month's value as of its last day (the plan
 * is resolved at month end server-side), so the tooltip should say which day that
 * is — the axis only has room for "Jul 2026" (260801 user request). The RUNNING
 * month stops at today: its point cannot describe days that haven't happened yet.
 *
 * Day-level labels and anything unrecognised pass through untouched.
 */
export function monthEndLabel(label: string, todayIso: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) return label;
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Day 0 of the NEXT month = the last day of this one (leap years included).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return todayIso >= monthEnd ? monthEnd : maxDay(monthEnd, todayIso, label);
}

/** The running month clamps to today; a future month keeps its last day. */
function maxDay(monthEnd: string, todayIso: string, label: string): string {
  return todayIso.startsWith(label) ? todayIso : monthEnd;
}
