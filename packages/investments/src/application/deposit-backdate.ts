/**
 * deposit-backdate.ts — analytic "backdate supplement" for wealth charts.
 *
 * Wealth snapshots only start carrying a deposit from the moment it was entered
 * (its `createdAt`) — the cron can't have captured it earlier. But a deposit's
 * value is fully deterministic (principal + compounding), so for the stretch
 * between its `startDate` and `createdAt` we can compute what it was worth and
 * ADD it to the series, letting the Overview show the deposit from its start
 * date instead of its creation date. Buckets at/after `createdAt` already carry
 * it (snapshot / live point), so they get 0 here — no double count.
 *
 * Non-deposit holdings have no such closed form (they need real price history),
 * so they keep starting at their creation date.
 */
import Big from "big.js";
import {
  computeDepositValueCents,
  type CapFrequency,
} from "../domain/deposit-value";

export type { CapFrequency } from "../domain/deposit-value";

export interface BackdateDeposit {
  principalCents: string | bigint | number;
  rateBps: number;
  startDate: string; // 'YYYY-MM-DD' — first day interest accrues
  capFrequency: CapFrequency;
  endDate?: string | null; // 'YYYY-MM-DD' maturity; value freezes on/after it
  /** 'YYYY-MM-DD' the holding was entered — the snapshot boundary. */
  createdAt: string;
  /** Current budget-currency value of the holding (listHoldings.valueInBudgetCents).
   *  The FX rate (incl. quantity) is derived as this ÷ the deposit's own-currency
   *  value today, so same-currency deposits get rate 1 and cross-currency ones are
   *  valued at the current rate across all of history. */
  valueInBudgetCents: string;
}

/**
 * Build a pure valuer: for a bucket date 'YYYY-MM-DD' it returns the total
 * deposit value (budget-currency cents) that captured snapshots do NOT yet
 * include — the sum, over deposits with `startDate <= date < createdAt`, of
 * `computeDepositValueCents(asOf=date) * fx`. Interest propagates because each
 * date is valued independently; a matured deposit freezes (the valuation clamps
 * at endDate). `today` is the valuation date for the FX denominator.
 */
export function buildDepositBackdate(
  deposits: BackdateDeposit[],
  today: string,
) {
  // Only deposits whose start predates their creation contribute a backdate gap.
  const specs = deposits
    .filter((d) => d.startDate < d.createdAt)
    .map((d) => {
      const ownCcyToday = computeDepositValueCents({
        principalCents: d.principalCents,
        rateBps: d.rateBps,
        startDate: d.startDate,
        capFrequency: d.capFrequency,
        asOf: today,
        endDate: d.endDate,
      });
      const fx =
        ownCcyToday === "0"
          ? new Big(0)
          : new Big(d.valueInBudgetCents).div(ownCcyToday);
      return { d, fx };
    });
  return (dateISO: string): bigint =>
    specs.reduce((sum, { d, fx }) => {
      // not started at this bucket, or snapshot already carries it → skip.
      if (dateISO < d.startDate || dateISO >= d.createdAt) return sum;
      const ownCcyVal = computeDepositValueCents({
        principalCents: d.principalCents,
        rateBps: d.rateBps,
        startDate: d.startDate,
        capFrequency: d.capFrequency,
        asOf: dateISO,
        endDate: d.endDate,
      });
      return (
        sum +
        BigInt(
          new Big(ownCcyVal).times(fx).round(0, Big.roundHalfUp).toFixed(0),
        )
      );
    }, 0n);
}
