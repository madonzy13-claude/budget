/**
 * today-tail.ts — give TODAY its own day of width on the timeline (260801).
 *
 * Points sit at the START of their day, so a month one day old had everything —
 * the boundary reset and the day's spend — at a single x, and the spend was
 * drawn as a vertical straight over the grey reset line (user screenshot).
 * Carrying the last reading to the END of today gives it one day of width, which
 * is its honest share of a time-proportional axis: the running month stays as
 * wide as the days it has actually had, not as wide as a whole month.
 */
import type { ResettableRow } from "./month-reset";

const DAY_MS = 86_400_000;

export function appendTodayTail<T extends ResettableRow>(
  rows: T[],
  todayIso: string,
): T[] {
  const last = rows[rows.length - 1];
  if (!last) return rows;
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  // Daily points land ON today; a monthly point for the running month is clamped
  // to it. Anything earlier is a finished range and needs no tail.
  if (last.ts !== today) return rows;
  return [...rows, { ...last, ts: today + DAY_MS, reset: true }];
}
