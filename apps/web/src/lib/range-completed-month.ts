/**
 * range-completed-month.ts — can these charts answer this range? (260804)
 *
 * "How far off plan, by category" and "Is each reserve the right size?" both
 * judge a month against its whole budget, and both leave the month still
 * running out on purpose: half a month of spend against a full month of limit
 * says nothing. Pick a range holding nothing but the running month and there is
 * no evidence left — so the charts step aside and say so rather than draw a bar
 * from a month that has not happened yet.
 *
 * Whole months only: a range that opens mid-June still contains June, which is
 * finished and therefore judgeable.
 */
export function rangeHasCompletedMonth(
  from: string,
  to: string,
  todayIso: string,
  /** The budget's own first month, 'YYYY-MM'. A month before it is finished on
   *  the calendar but the budget never lived through it — a budget begun this
   *  month had a year of them in "12M" and drew both charts from nothing
   *  (user, 261017). Absent = no floor. */
  firstMonth?: string | null,
): boolean {
  const month = (iso: string) => iso.slice(0, 7);
  const [rangeStart, t, now] = [month(from), month(to), month(todayIso)];
  if (rangeStart.length !== 7 || t.length !== 7 || now.length !== 7)
    return false;
  const f = firstMonth && firstMonth > rangeStart ? firstMonth : rangeStart;
  // Any month in range that is strictly before the running one is finished.
  return f < now && t >= f;
}
