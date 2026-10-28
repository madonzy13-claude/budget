/**
 * Phase 13 booking math — every money movement between investments.
 *
 * One rule shared by Sell, Withdraw (Sell → Out of investments) and the Edit
 * shortcuts (Added money / Withdrew money / Bought more). Pure: bigint cents
 * in, bigint cents out, big.js half-even rounding once per output.
 *
 * FX rule (D-18, 13.1 UAT 14): ONE rate per deal. Proceeds are brought back
 * into the source currency with rate(source → received) — the rate the sell
 * form priced with — and realized is converted to budget currency with
 * rate(source → budget), both as of the sale effective_date. Two independent
 * lookups (received → budget vs source → received) are not reciprocal and
 * booked −19.20 on a fair swap. A backdated sale stays frozen at that day.
 *
 * Reversal rule (D-06): an entry is undone by subtracting ITS OWN stored
 * deltas from the holding's CURRENT state — never by restoring a snapshot.
 * Changes made after the entry survive; only this entry's effect goes away.
 */
import Big from "big.js";

const HALF_EVEN = 2;

export const big = (n: bigint | string): Big => new Big(n.toString());
export const cents = (b: Big): bigint =>
  BigInt(b.round(0, HALF_EVEN).toFixed(0));
export const qty = (b: Big): string => {
  const s = b.toFixed(8);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

export function sellAmountHolding(i: {
  buyCents: bigint;
  valueCents: bigint;
  keepCents: bigint;
}): { keptCostCents: bigint; soldCostCents: bigint } {
  if (i.valueCents <= 0n) throw new RangeError("no_value");
  if (i.keepCents < 0n || i.keepCents >= i.valueCents)
    throw new RangeError("keep_out_of_range");
  const keptCostCents = cents(
    big(i.buyCents).times(big(i.keepCents)).div(big(i.valueCents)),
  );
  return { keptCostCents, soldCostCents: i.buyCents - keptCostCents };
}

export function sellQuantityHolding(i: {
  quantity: string;
  buyPriceCents: bigint;
  sellQuantity: string;
}): { newQuantity: string; soldCostCents: bigint } {
  const held = big(i.quantity);
  const sell = big(i.sellQuantity);
  if (sell.lte(0) || sell.gt(held))
    throw new RangeError("sell_qty_out_of_range");
  // IN-02: rounding to 8 dp could turn a part-sale into a full sale.
  if (!sell.eq(sell.round(8, 0))) throw new RangeError("qty_precision");
  return {
    newQuantity: qty(held.minus(sell)),
    soldCostCents: cents(big(i.buyPriceCents).times(sell)),
  };
}

export function realizedInBudget(i: {
  receivedCents: bigint;
  /** rate(source → received) — the SAME lookup the sell form previews with. */
  sourceToReceivedRate: string;
  soldCostCents: bigint;
  sourceToBudgetRate: string;
}): {
  receivedBudgetCents: bigint;
  soldCostBudgetCents: bigint;
  realizedBudgetCents: bigint;
} {
  const proceeds = big(i.receivedCents).div(big(i.sourceToReceivedRate));
  const toBudget = big(i.sourceToBudgetRate);
  const soldCostBudgetCents = cents(big(i.soldCostCents).times(toBudget));
  const realizedBudgetCents = cents(
    proceeds.minus(big(i.soldCostCents)).times(toBudget),
  );
  return {
    receivedBudgetCents: soldCostBudgetCents + realizedBudgetCents,
    soldCostBudgetCents,
    realizedBudgetCents,
  };
}

export function buyMore(i: {
  quantity: string;
  buyPriceCents: bigint;
  addQuantity: string;
  paidCents: bigint;
}): { newQuantity: string; newBuyPriceCents: bigint } {
  if (big(i.addQuantity).lte(0) || i.paidCents <= 0n)
    throw new RangeError("buy_positive");
  const held = big(i.quantity);
  const total = held.plus(big(i.addQuantity));
  const cost = big(i.buyPriceCents).times(held).plus(big(i.paidCents));
  return { newQuantity: qty(total), newBuyPriceCents: cents(cost.div(total)) };
}

/** Amount holdings (qty = 1): "Added money" raises cost by the amount. */
export function addMoney(i: { buyCents: bigint; amountCents: bigint }): {
  newBuyCents: bigint;
} {
  if (i.amountCents <= 0n) throw new RangeError("amount_positive");
  return { newBuyCents: i.buyCents + i.amountCents };
}

/** Sale proceeds landing in an existing amount holding raise cost and value alike. */
export function mergeIntoAmountHolding(i: {
  buyCents: bigint;
  currentCents: bigint;
  receivedCents: bigint;
}): { newBuyCents: bigint; newCurrentCents: bigint } {
  return {
    newBuyCents: i.buyCents + i.receivedCents,
    newCurrentCents: i.currentCents + i.receivedCents,
  };
}

/**
 * D-20 partial deposit sale. A deposit keeps principal and cost in ONE field
 * (buy_price_cents), so the remainder restarts with principal = cost = keep
 * (caller also sets deposit_start_date = sale date). soldCost = principal −
 * keep, so with received = value − keep, realized = value − principal = ALL
 * interest so far. soldCost goes negative when keep > principal — intended:
 * lifetime cost (held + sold) and total P/L stay exact.
 * Undo is NOT delta-based (start date restarts): caller stores the prior
 * principal + start date on the history row and restores them.
 */
export function sellDepositPart(i: {
  principalCents: bigint;
  valueCents: bigint;
  keepCents: bigint;
}): { newPrincipalCents: bigint; soldCostCents: bigint } {
  if (i.keepCents < 0n || i.keepCents >= i.valueCents)
    throw new RangeError("keep_out_of_range");
  return {
    newPrincipalCents: i.keepCents,
    soldCostCents: i.principalCents - i.keepCents,
  };
}

export function reverseEntry(i: {
  shape: "quantity" | "amount";
  quantity: string;
  buyPriceCents: bigint;
  currentPriceCents: bigint | null;
  qtyDelta: string | null;
  costDeltaCents: bigint;
  valueDeltaCents: bigint;
}): {
  quantity: string;
  buyPriceCents: bigint;
  currentPriceCents: bigint | null;
} {
  if (i.shape === "amount") {
    const buy = i.buyPriceCents - i.costDeltaCents;
    const current =
      i.currentPriceCents === null
        ? null
        : i.currentPriceCents - i.valueDeltaCents;
    if (buy < 0n || (current !== null && current < 0n))
      throw new RangeError("would_go_negative");
    return {
      quantity: i.quantity,
      buyPriceCents: buy,
      currentPriceCents: current,
    };
  }
  const held = big(i.quantity);
  const newQty = held.minus(big(i.qtyDelta ?? "0"));
  if (newQty.lte(0)) throw new RangeError("would_empty_holding");
  const total = big(i.buyPriceCents).times(held).minus(big(i.costDeltaCents));
  if (total.lt(0)) throw new RangeError("would_go_negative");
  return {
    quantity: qty(newQty),
    buyPriceCents: cents(total.div(newQty)),
    currentPriceCents: i.currentPriceCents,
  };
}
