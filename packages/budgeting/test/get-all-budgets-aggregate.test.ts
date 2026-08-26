/**
 * get-all-budgets-aggregate.test.ts — RED (Task 6).
 *
 * Pure application service: all collaborators stubbed, no DB. Asserts:
 *   - FX converts every figure to the user's display currency
 *   - WEALTH figures (net worth, investments, cash, reserves, cushion) additionally
 *     scale by the member's ownership share
 *   - FLOW figures (spent/left/overspent this month) are FX-converted but NOT
 *     share-scaled
 *   - a thrown FX rate flags fx_unavailable instead of throwing
 *   - health derives red on overspent
 */
import { describe, it, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import { getAllBudgetsAggregate } from "../src/application/get-all-budgets-aggregate";

const cards = (over: Partial<any> = {}) => ({
  default_currency: "EUR",
  available_to_spend_cents: 100000n,
  monthly_planned_cents: 80000n,
  capitalization_cents: 1000000n,
  investment_value_cents: 400000n,
  possessions_value_cents: 0n,
  available_reserves_cents: 200000n,
  spendings: {
    spent_cents: 50000n,
    left_cents: 60000n,
    wallet_cents: 100000n,
    good: true,
  },
  reserves: {
    required_cents: 0n,
    wallet_cents: 200000n,
    status: "ok" as const,
  },
  cushion: {
    enabled: true,
    real_months: 6,
    total_cents: 300000n,
    required_cents: 300000n,
    monthly_cents: 50000n,
    covered: true,
  },
  overspent: { count: 0, currency: "EUR", total_cents: 0n, top: [] },
  retirement_months: null,
  retirement_inflation_pct: 4.5,
  ...over,
});

const deps = {
  listForUser: async () => [
    {
      id: "b1",
      name: "Home",
      default_currency: "EUR",
      member_count: 2,
      pendingTasksCount: 3,
    },
  ],
  getOverviewCardsForTenant: async () => ok(cards()),
  getAggPrefsForUser: async () =>
    new Map([
      ["b1", { ownership_share_pct: 60, include_in_aggregation: true }],
    ]),
  displayCurrencyReader: { getDisplayCurrency: async () => "USD" },
  fxProvider: {
    rateAsOf: async () => ({ rate: "1.10", provider: "test", isStale: false }),
  },
  now: () => new Date("2026-07-17T00:00:00Z"),
};

describe("getAllBudgetsAggregate", () => {
  it("FX-converts to display ccy and scales WEALTH by share, not flow", async () => {
    const out = await getAllBudgetsAggregate(deps as any)("u1");
    expect(out.display_currency).toBe("USD");
    const row = out.budgets[0]!;
    // net worth: 1_000_000 EUR × 1.10 × 0.60 = 660_000
    expect(row.net_worth_cents).toBe("660000");
    // spent: 50_000 × 1.10, NO share = 55_000
    expect(row.spent_month_cents).toBe("55000");
    expect(row.my_share_pct).toBe(60);
    expect(row.health).toBe("green");
  });

  // 260721: decimal ownership share (numeric(5,2)) must not crash BigInt() and
  // must scale correctly via basis points.
  it("scales WEALTH by a DECIMAL ownership share (e.g. 33.5%)", async () => {
    const d = {
      ...deps,
      getAggPrefsForUser: async () =>
        new Map([
          ["b1", { ownership_share_pct: 33.5, include_in_aggregation: true }],
        ]),
    };
    const out = await getAllBudgetsAggregate(d as any)("u1");
    const row = out.budgets[0]!;
    // 1_000_000 EUR × 1.10 × 0.335 = 368_500
    expect(row.net_worth_cents).toBe("368500");
    expect(row.my_share_pct).toBe(33.5);
  });

  it("flags fx_unavailable and does not throw when a rate is missing", async () => {
    const bad = {
      ...deps,
      fxProvider: {
        rateAsOf: async () => {
          throw new Error("NoFxRateAvailable");
        },
      },
    };
    const out = await getAllBudgetsAggregate(bad as any)("u1");
    expect(out.budgets[0]!.fx_unavailable).toBe(true);
  });

  it("derives red health when overspent", async () => {
    const red = {
      ...deps,
      getOverviewCardsForTenant: async () =>
        ok(
          cards({
            overspent: {
              count: 2,
              currency: "EUR",
              total_cents: 5000n,
              top: [],
            },
          }),
        ),
    };
    const out = await getAllBudgetsAggregate(red as any)("u1");
    expect(out.budgets[0]!.health).toBe("red");
  });
});

/**
 * The spend card's third row, ported from the BDP overview: the household's
 * DEFICIT when a forecast goes under, otherwise what is FREE TO MOVE, otherwise
 * nothing. Both are summed across the included budgets and FX-converted, so a
 * hole in PLN is never weighed against spare in EUR (user, 260826).
 *
 * The rate stub is 1.10, so every cents figure below arrives multiplied by it.
 */
describe("getAllBudgetsAggregate — forecast figures for the spend card", () => {
  const withProjection = (p: {
    days: { availableCents: bigint }[];
    summary: { worstShortfallCents: bigint };
    safeToWithdraw: { cents: bigint };
  }) => ({ ...deps, getCashflowProjectionForTenant: async () => p });

  it("sums what can be withdrawn when nothing goes under", async () => {
    const out = await getAllBudgetsAggregate(
      withProjection({
        days: [{ availableCents: 40_000n }],
        summary: { worstShortfallCents: 0n },
        safeToWithdraw: { cents: 30_000n },
      }) as any,
    )("u1");
    expect(out.forecast_shortfall_cents).toBe("0");
    expect(out.forecast_free_to_move_cents).toBe("33000"); // 30,000 × 1.10
    expect(out.forecast_status).toBe("green");
  });

  it("sums the shortfall when a forecast does go under", async () => {
    const out = await getAllBudgetsAggregate(
      withProjection({
        days: [{ availableCents: -20_000n }],
        summary: { worstShortfallCents: 20_000n },
        safeToWithdraw: { cents: -20_000n },
      }) as any,
    )("u1");
    expect(out.forecast_shortfall_cents).toBe("22000"); // 20,000 × 1.10
    expect(out.forecast_status).toBe("red");
  });

  // Nothing spare and nothing wrong is the state the BDP card renders as
  // silence, so the aggregate has to be able to say it too: both zero.
  it("reports both as zero when there is nothing to say", async () => {
    const out = await getAllBudgetsAggregate(
      withProjection({
        days: [{ availableCents: 0n }],
        summary: { worstShortfallCents: 0n },
        safeToWithdraw: { cents: 0n },
      }) as any,
    )("u1");
    expect(out.forecast_shortfall_cents).toBe("0");
    expect(out.forecast_free_to_move_cents).toBe("0");
  });

  // A budget whose forecast cannot be built already abstains from the verdict;
  // it must not drag the figures either.
  it("lets a budget whose forecast throws abstain from both figures", async () => {
    const out = await getAllBudgetsAggregate({
      ...deps,
      getCashflowProjectionForTenant: async () => {
        throw new Error("no forecast");
      },
    } as any)("u1");
    expect(out.forecast_shortfall_cents).toBe("0");
    expect(out.forecast_free_to_move_cents).toBe("0");
  });

  // Without the dep wired the aggregate still builds; the card then has no
  // figures to show rather than wrong ones.
  it("reports zeroes when no projection dep is wired at all", async () => {
    const out = await getAllBudgetsAggregate(deps as any)("u1");
    expect(out.forecast_shortfall_cents).toBe("0");
    expect(out.forecast_free_to_move_cents).toBe("0");
  });
});
