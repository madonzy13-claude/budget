/**
 * group-flow.ts — pure maths for the investment group deposit/withdrawal ledger.
 *
 * A group is a mini-portfolio: growing/adding a holding is a deposit (books its
 * cost), selling/removing one is a withdrawal (books its current value). This
 * module computes the ledger leg for a quantity leaving a group (write side) and
 * folds the ledger back into realized gains per group in the budget currency
 * (read side). Both are framework-free so the money maths is unit-tested in
 * isolation; the FX rates come from the caller (list-holdings' existing rate map).
 */
import Big from "big.js";
import type { GroupFlowLeg } from "../ports/holding-repo";

export type WithdrawalLeg = Omit<GroupFlowLeg, "groupName">;

/**
 * The ledger leg for `leavingQty` units leaving a group, priced at the holding's
 * current price. Returns null when nothing is realizable — no cost basis, no
 * current price, or a non-positive quantity (cash/no-basis holdings are excluded
 * from group P/L, so their exit books nothing).
 */
export function withdrawalLeg(params: {
  leavingQty: string;
  buyPriceCents: bigint | null;
  buyCurrency: string | null;
  sellPriceCents: bigint | null;
  sellCurrency: string | null;
}): WithdrawalLeg | null {
  const { buyPriceCents, sellPriceCents } = params;
  if (buyPriceCents === null || sellPriceCents === null) return null;
  let q: Big;
  try {
    q = new Big(params.leavingQty || "0");
  } catch {
    return null;
  }
  if (q.lte(0)) return null;
  const cost = q.times(buyPriceCents.toString());
  const proceeds = q.times(sellPriceCents.toString());
  return {
    costCents: BigInt(cost.round(0).toFixed(0)),
    costCurrency: params.buyCurrency,
    proceedsCents: BigInt(proceeds.round(0).toFixed(0)),
    proceedsCurrency: params.sellCurrency,
  };
}

/**
 * Fold ledger legs into realized gains per group, in budget cents. `rate(ccy)`
 * returns the ccy→budget FX rate as a decimal string ("1" for same currency).
 * realized = Σ(proceeds·rate − cost·rate) over each group's legs.
 */
export function realizedCentsByGroup(
  legs: GroupFlowLeg[],
  rate: (ccy: string | null) => string,
): Record<string, string> {
  const acc: Record<string, Big> = {};
  for (const leg of legs) {
    const proceeds = new Big(leg.proceedsCents.toString()).times(
      new Big(rate(leg.proceedsCurrency)),
    );
    const cost = new Big(leg.costCents.toString()).times(
      new Big(rate(leg.costCurrency)),
    );
    const realized = proceeds.minus(cost);
    acc[leg.groupName] = (acc[leg.groupName] ?? new Big(0)).plus(realized);
  }
  const out: Record<string, string> = {};
  for (const g of Object.keys(acc)) out[g] = acc[g].round(0).toFixed(0);
  return out;
}
