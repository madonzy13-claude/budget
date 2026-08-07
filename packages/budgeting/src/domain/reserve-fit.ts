/**
 * reserve-fit.ts — how big a reserve a category's own history asked for.
 *
 * The reserve engine (reserve-engine.ts) answers "what happened": R, U, overage,
 * overspent. This answers the question the member actually acts on — "is the
 * buffer the right size?" — and it is a different sum.
 *
 * A category is funded by its quiet months: `left` accrues into R at month close,
 * uncapped. So when the LIMIT is right, quiet months pay for loud ones on their
 * own and the reserve only bridges the TIMING — a big month landing before enough
 * surplus has piled up. That makes the honest measure of "needed" the deepest
 * cumulative trough of the monthly net flow `left − overage`, walked from zero:
 * the starting buffer that would have kept `overspent` at zero all range.
 *
 *   month:   Sep   Oct   Nov   Dec
 *   net:    +200  +150  −900  +100
 *   walk:    200   350  −550  −450     → needed = 550
 *
 * NOT the average overage (understates: it ignores that holes arrive in lumps)
 * and NOT the worst month (overstates: it ignores that quiet months refill).
 *
 * Exceptional spend is handled UPSTREAM: the caller subtracts transactions the
 * budget has marked as one-offs before it hands months over. A statistic cannot
 * tell "rare" from "won't happen again" — a 5,000 insurance charge every
 * September is rare and certain, a 5,000 parachute jump is rare and not — so
 * that judgement stays with the household (user decision, 260804).
 *
 * Pure: no IO, no Temporal, integer cents throughout.
 */

export interface ReserveFitMonth {
  /** 'YYYY-MM'. */
  month: string;
  /** The limit in force that month — cushion or normal, resolved by the caller. */
  limitCents: bigint;
  /** Spend that month, already net of any excluded one-off transactions. */
  spentCents: bigint;
}

export interface ReserveFitResult {
  /** The buffer that would have kept overspent at zero across the range. */
  neededCents: bigint;
  /** The single largest overage, and the month it landed in. */
  worstOverageCents: bigint;
  worstMonth: string | null;
  /** How many months went over their limit at all. */
  overageMonths: number;
  /** Months of history the answer rests on — thin history is not evidence. */
  monthsCounted: number;
}

const max0 = (v: bigint) => (v > 0n ? v : 0n);

export function reserveFit(
  months: readonly ReserveFitMonth[],
): ReserveFitResult {
  // Month order is the whole point of a drawdown: surplus banked AFTER a trough
  // cannot fill it. Sort rather than trust the caller — 'YYYY-MM' sorts by date.
  const ordered = [...months].sort((a, b) => (a.month < b.month ? -1 : 1));

  let running = 0n; // cumulative net flow
  let trough = 0n; // deepest the walk ever went (≤ 0)
  let worstOverage = 0n;
  let worstMonth: string | null = null;
  let overageMonths = 0;

  for (const mo of ordered) {
    const overage = max0(mo.spentCents - mo.limitCents);
    const left = max0(mo.limitCents - mo.spentCents);
    if (overage > 0n) {
      overageMonths += 1;
      if (overage > worstOverage) {
        worstOverage = overage;
        worstMonth = mo.month;
      }
    }
    running += left - overage;
    if (running < trough) trough = running;
  }

  return {
    neededCents: -trough,
    worstOverageCents: worstOverage,
    worstMonth,
    overageMonths,
    monthsCounted: ordered.length,
  };
}
