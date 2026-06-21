/**
 * portfolio-metrics.ts — pure investment math (Phase 9, INV-08/09/10).
 * All arithmetic via big.js (T-9-04 — no float on money paths; cents stay exact).
 * The domain is FX-provider-free: callers pass plain conversion rate strings
 * (computed from FxProvider.rateAsOf) so this module stays pure (D-13).
 *
 * NO "pending"/"stale" anywhere (A2): a current price is always present (the API
 * blocks save otherwise). Delisted does not change the math (last cached price used).
 */
import Big from "big.js";
import type { Holding } from "./holding";

/** A holding's value currency -> budget default currency conversion rate. */
export type RateMap = Record<string, string | number>;

/**
 * Total value of a holding, in CENTS, as an exact Big (no rounding).
 * cash_fx: value = the cash amount (currentPriceCents), quantity ignored.
 * everything else: value = quantity x currentPriceCents.
 */
export function holdingValue(h: Holding): Big {
  const priceCents = new Big((h.currentPriceCents ?? 0n).toString());
  if (h.isCash()) {
    return priceCents;
  }
  return new Big(h.quantity).times(priceCents);
}

/**
 * Profit/loss as a signed percentage rounded to 1 decimal (UI-SPEC formatting),
 * or null when there is no P/L basis (cash_fx, or missing buy/current price).
 *
 * P/L % = (currentPrice→buyCurrency − buyPrice) / buyPrice × 100.
 * `rate` is the currentPriceCurrency→buyCurrency rate; ignored when same currency.
 */
export function profitLossPct(
  h: Holding,
  rate: string | number = 1,
): number | null {
  if (h.isCash()) return null;
  if (h.buyPriceCents === null || h.currentPriceCents === null) return null;

  const buy = new Big(h.buyPriceCents.toString());
  if (buy.eq(0)) return null;

  let current = new Big(h.currentPriceCents.toString());
  if (h.currentPriceCurrency !== h.buyCurrency) {
    current = current.times(new Big(String(rate)));
  }

  // Percentage is a display ratio (not money) — safe to surface as a JS number.
  const pct = current.minus(buy).div(buy).times(100);
  return Number(pct.toFixed(1));
}

/** Value of a holding expressed in the budget default currency (cents, Big). */
function toBudgetCcyValue(
  h: Holding,
  rates: RateMap,
  budgetCurrency: string,
): Big {
  const value = holdingValue(h);
  const ccy = h.currentPriceCurrency ?? h.buyCurrency;
  if (!ccy || ccy === budgetCurrency) return value;
  const rate = rates[ccy];
  if (rate === undefined) {
    throw new Error(
      `portfolio-metrics: missing rate ${ccy}->${budgetCurrency}`,
    );
  }
  return value.times(new Big(String(rate)));
}

const pct2 = (num: Big, denom: Big): number =>
  denom.eq(0) ? 0 : Number(num.div(denom).times(100).toFixed(2));

/**
 * Per-holding weight % keyed by holding id (INV-10).
 * Grouped holding -> share of its group total; ungrouped -> share of the whole
 * portfolio. Denominators are computed in the budget default currency.
 */
export function portfolioWeights(
  holdings: Holding[],
  rates: RateMap,
  budgetCurrency: string,
): Map<string, number> {
  const values = new Map<string, Big>(
    holdings.map((h) => [h.id, toBudgetCcyValue(h, rates, budgetCurrency)]),
  );

  let portfolioTotal = new Big(0);
  const groupTotals = new Map<string, Big>();
  for (const h of holdings) {
    const v = values.get(h.id)!;
    portfolioTotal = portfolioTotal.plus(v);
    if (h.group !== null) {
      groupTotals.set(
        h.group,
        (groupTotals.get(h.group) ?? new Big(0)).plus(v),
      );
    }
  }

  const out = new Map<string, number>();
  for (const h of holdings) {
    const denom = h.group !== null ? groupTotals.get(h.group)! : portfolioTotal;
    out.set(h.id, pct2(values.get(h.id)!, denom));
  }
  return out;
}

/**
 * Group-% of the whole portfolio keyed by group name (INV-10).
 * Denominator is the portfolio total in the budget default currency.
 */
export function groupWeights(
  holdings: Holding[],
  rates: RateMap,
  budgetCurrency: string,
): Map<string, number> {
  let portfolioTotal = new Big(0);
  const groupTotals = new Map<string, Big>();
  for (const h of holdings) {
    const v = toBudgetCcyValue(h, rates, budgetCurrency);
    portfolioTotal = portfolioTotal.plus(v);
    if (h.group !== null) {
      groupTotals.set(
        h.group,
        (groupTotals.get(h.group) ?? new Big(0)).plus(v),
      );
    }
  }

  const out = new Map<string, number>();
  for (const [group, total] of groupTotals) {
    out.set(group, pct2(total, portfolioTotal));
  }
  return out;
}
