/**
 * chart-timestamp.ts — chart label → epoch ms (260801).
 *
 * The planned chart plotted points on a CATEGORY axis, so every point got the
 * same width: the one-day step from 31 Jul to a running 1 Aug looked as wide as
 * the thirty days before it. Plotting at real timestamps makes the horizontal
 * spacing proportional to elapsed time.
 *
 * A monthly label stands for its month END — clamped to today while the month is
 * still running, which is exactly what makes the current month narrow.
 */
export function labelToTimestamp(label: string, todayIso: string): number {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label);
  if (day) return Date.parse(`${label}T00:00:00Z`);

  const month = /^(\d{4})-(\d{2})$/.exec(label);
  if (!month) return NaN;
  const year = Number(month[1]);
  const mon = Number(month[2]);
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const monthEnd = `${month[1]}-${month[2]}-${String(lastDay).padStart(2, "0")}`;
  const iso =
    todayIso.startsWith(label) && todayIso < monthEnd ? todayIso : monthEnd;
  return Date.parse(`${iso}T00:00:00Z`);
}
