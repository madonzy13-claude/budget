/**
 * today-tail.ts — give TODAY its own day of width on the timeline (260801).
 *
 * Points sit at the START of their day, so a month one day old had everything —
 * the boundary reset and the day's spend — at a single x, and the spend was
 * drawn as a vertical straight over the grey reset line (user screenshot).
 * Moving the last reading to the END of today gives it one day of width, which
 * is its honest share of a time-proportional axis: the running month stays as
 * wide as the days it has actually had, not as wide as a whole month.
 */
import type { ResettableRow } from "./month-reset";

const DAY_MS = 86_400_000;

/**
 * The tail sits a day AHEAD of the day it reports, because that is how it gets
 * its width on a time-proportional axis. That is geometry, not a reading — so
 * anything that NAMES the point has to map it back first, or the tooltip dates
 * today's figures tomorrow (user, 260810: "11 Aug 2026", on the 10th).
 */
export function tailDay(ts: number, todayIso: string): number {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  return ts === today + DAY_MS ? today : ts;
}

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
  // MOVED, not copied: a copy ended the run on a second stop with today's own
  // numbers, and silencing that stop left the end of the line unanswerable
  // (user reports, 260802). Today's reading keeps its date and simply spans the
  // day it belongs to.
  return [...rows.slice(0, -1), { ...last, ts: today + DAY_MS }];
}
