/**
 * reserve-month-conversion.ts — D-17: replay a CLOSED month across a category
 * currency change.
 *
 * "Each past month is computed in the currency the category had IN THAT MONTH
 * (limit in that currency; spending converted to it at each transaction's
 * date). Only the month's RESULT converts to the category's current currency:
 * a LEFTOVER at that month's closing rate (last rate within the month); an
 * OVERSPEND at the rate on the date(s) of the transaction(s) that pushed
 * spending past the limit (a transaction straddling the limit: only the part
 * above it uses its date)." Closed months never move: every rate is a past one.
 *
 * Overspend attribution: walk the month's transactions in order keeping the
 * running total S and a LIFO stack of above-limit portions {date, cents}. A
 * payment pushes the part of it above max(limit, S before it). A refund pops
 * from the top of the stack first (the most recent overspend), and whatever
 * is left of it lowers S under the limit. Σ stack == max(S − limit, 0); each
 * portion converts at its own date and rounds on its own.
 */
import { convertCents } from "./fx-round";

export type ClosedMonthInput = {
  /** Month currency: the limit the engine judges this month against (cushion or normal, resolved). */
  effLimitCents: bigint;
  noLimit: boolean;
  /** Month currency, ordered (transaction_date, created_at, id); negatives = refunds. */
  txs: Array<{ date: string; cents: bigint }>;
  /** Month currency → current currency, last rate available within the month. */
  closeRate: string;
  /** Month currency → current currency at a transaction date. */
  rateOn: (date: string) => string;
};

/** All in the category's CURRENT currency. */
export type ClosedMonthResult = { limitCents: bigint; leftCents: bigint; overageCents: bigint };

export type EngineMonthEvents = {
  normalCents: bigint;
  cushionCents: bigint;
  spendCents: bigint;
  noLimit: boolean;
};

export function convertClosedMonthResult(input: ClosedMonthInput): ClosedMonthResult {
  if (input.noLimit) return { limitCents: 0n, leftCents: 0n, overageCents: 0n };

  const L = input.effLimitCents;
  let S = 0n;
  const stack: { date: string; cents: bigint }[] = [];

  for (const tx of input.txs) {
    if (tx.cents >= 0n) {
      const floor = S > L ? S : L;
      const above = S + tx.cents - floor;
      if (above > 0n) stack.push({ date: tx.date, cents: above });
    } else {
      let refund = -tx.cents;
      while (refund > 0n && stack.length > 0) {
        const top = stack[stack.length - 1]!;
        const take = top.cents < refund ? top.cents : refund;
        top.cents -= take;
        refund -= take;
        if (top.cents === 0n) stack.pop();
      }
    }
    S += tx.cents;
  }

  const overageCents = stack.reduce(
    (sum, p) => sum + convertCents(p.cents, input.rateOn(p.date)),
    0n,
  );
  const leftCents = L > S ? convertCents(L - S, input.closeRate) : 0n;
  return { limitCents: convertCents(L, input.closeRate), leftCents, overageCents };
}

/**
 * Engine events that make the unchanged reserve engine reproduce a converted
 * month exactly: max(spend − limit, 0) == overage, max(limit − spend, 0) == left.
 * The month's effective limit is already resolved, so normal and cushion both carry it.
 */
export function toEngineMonthEvents(r: ClosedMonthResult, noLimit: boolean): EngineMonthEvents {
  if (noLimit) return { normalCents: 0n, cushionCents: 0n, spendCents: 0n, noLimit: true };
  const spendCents = r.overageCents > 0n ? r.limitCents + r.overageCents : r.limitCents - r.leftCents;
  return { normalCents: r.limitCents, cushionCents: r.limitCents, spendCents, noLimit: false };
}
