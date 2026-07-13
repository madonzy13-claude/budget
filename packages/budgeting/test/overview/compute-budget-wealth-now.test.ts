/**
 * compute-budget-wealth-now.test.ts — RED (11-03 Task 1).
 *
 * computeBudgetWealthNow is the shared wealth primitive reused by the cards card
 * (11-03), the wealth live-point (11-06) and the 3h snapshot cron (11-07). It must
 * produce:
 *   - investment_value_cents = Σ holdings value already FX→default_ccy (non-archived)
 *   - capitalization_cents   = Σ ALL wallet balances (FX→default_ccy) + investment value
 *   - currency               = the budget default_currency
 * bigint throughout; FX via FxProvider.rateAsOf (X→X = "1").
 */
import { describe, test, expect } from "bun:test";
import {
  computeBudgetWealthNow,
  type WalletWithType,
  type ComputeBudgetWealthNowDeps,
} from "@budget/budgeting/src/application/compute-budget-wealth-now";

function fxProvider(rates: Record<string, string>) {
  return {
    async rateAsOf(from: string, to: string) {
      const rate = from === to ? "1" : (rates[`${from}->${to}`] ?? "1");
      return { rate, provider: "stub", isStale: false };
    },
  };
}

function deps(
  wallets: WalletWithType[],
  investmentValueCents: bigint,
  rates: Record<string, string> = {},
  investmentCostBasisCents: bigint = 0n,
): ComputeBudgetWealthNowDeps {
  return {
    walletRepo: {
      async listWalletsWithType() {
        return wallets;
      },
    },
    holdingsValuation: {
      async investmentValueCents() {
        return investmentValueCents;
      },
      async investmentCostBasisCents() {
        return investmentCostBasisCents;
      },
    },
    fxProvider: fxProvider(rates) as ComputeBudgetWealthNowDeps["fxProvider"],
  };
}

const input = {
  budgetId: "b1",
  tenantId: "b1",
  defaultCurrency: "USD",
  now: new Date("2026-06-15T00:00:00Z"),
};

describe("computeBudgetWealthNow", () => {
  test("capitalization sums ALL wallet types + investment value in default_currency", async () => {
    const wallets: WalletWithType[] = [
      { amount_cents: 10000n, currency: "USD", wallet_type: "SPENDINGS" },
      { amount_cents: 5000n, currency: "USD", wallet_type: "RESERVE" },
      { amount_cents: 3000n, currency: "USD", wallet_type: "CUSHION" },
    ];
    const out = await computeBudgetWealthNow(deps(wallets, 0n))(input);
    expect(out.capitalization_cents).toBe(18000n);
    expect(out.investment_value_cents).toBe(0n);
    expect(out.currency).toBe("USD");
  });

  test("returns the investments cost basis (0062, for P/L over time)", async () => {
    const out = await computeBudgetWealthNow(
      deps([], 60000n, {}, 40000n /* cost basis */),
    )(input);
    expect(out.investment_value_cents).toBe(60000n);
    expect(out.investment_cost_basis_cents).toBe(40000n);
  });

  test("FX-converts non-default-currency wallets to default_currency", async () => {
    const wallets: WalletWithType[] = [
      { amount_cents: 10000n, currency: "EUR", wallet_type: "SPENDINGS" },
    ];
    const out = await computeBudgetWealthNow(
      deps(wallets, 0n, { "EUR->USD": "1.1" }),
    )(input);
    expect(out.capitalization_cents).toBe(11000n);
  });

  test("adds investment value (already default-ccy cents) into capitalization", async () => {
    const wallets: WalletWithType[] = [
      { amount_cents: 10000n, currency: "USD", wallet_type: "SPENDINGS" },
    ];
    const out = await computeBudgetWealthNow(deps(wallets, 10000n))(input);
    expect(out.investment_value_cents).toBe(10000n);
    expect(out.capitalization_cents).toBe(20000n);
  });
});
