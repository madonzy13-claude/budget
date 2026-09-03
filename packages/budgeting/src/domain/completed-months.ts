/**
 * completed-months.ts — the months a rate may honestly be averaged over.
 *
 * Two rules were fighting each other. The overview's ranges run from a date to
 * TODAY, and both surfaces that turn history into a per-month figure — the
 * reserve requirement and the planned-vs-real averages — then drop the month
 * still running, because a few days of spending against a whole month's limit
 * is not a rate.
 *
 * Correct on its own, but it silently shortened the sample: on the 1st of a
 * month "1Y" averaged 11 months, "6M" averaged 5 and "3M" averaged 2. A third
 * of the evidence gone, and only on some days of the month, so the same budget
 * gave different advice depending on when it was opened.
 *
 * Dropping the running month stays. What gives is ending at today: the window
 * slides back far enough to keep the count the caller asked for. "3M" means
 * three complete months, whichever day you ask on.
 *
 * Only for figures that ADVISE. Charts keep every month the range covers,
 * running one included — on a chart a part-finished month is just a short bar,
 * and hiding it would hide the month the reader cares about most.
 *
 * Pure: no clock (the caller passes the month it considers current), no IO.
 */

/** 'YYYY-MM' one month later. */
function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** 'YYYY-MM' one month earlier. */
function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}

export interface CompletedMonthsInput {
  /** Range start, 'YYYY-MM-DD'. */
  from: string;
  /** Range end, 'YYYY-MM-DD'. */
  to: string;
  /** The month the caller considers still running, 'YYYY-MM'. */
  nowMonth: string;
}

/**
 * The complete months to average over: as many as the range spans, ending with
 * the last month that has actually finished.
 *
 * A range wholly in the past is returned exactly as asked — nothing in it is
 * running, so there is nothing to compensate for and a custom range must mean
 * what it says.
 */
export function completedMonthsForRange(input: CompletedMonthsInput): string[] {
  const first = input.from.slice(0, 7);
  const last = input.to.slice(0, 7);
  if (last < first) return [];

  // How many months the caller asked for — the count to preserve.
  let span = 0;
  for (let m = first; m <= last; m = nextMonth(m)) span += 1;

  // The last month that has finished. A range ending before the running month
  // needs no adjustment; one reaching into it (or past it) ends the month
  // before.
  const lastComplete = last < input.nowMonth ? last : prevMonth(input.nowMonth);

  // The running month is all there is. A weak signal beats none at all — the
  // rule a brand-new budget has always relied on to show anything.
  if (lastComplete < first && first === input.nowMonth) return [input.nowMonth];

  const months: string[] = [];
  for (let m = lastComplete, i = 0; i < span; i += 1, m = prevMonth(m)) {
    months.push(m);
  }
  return months.reverse();
}
