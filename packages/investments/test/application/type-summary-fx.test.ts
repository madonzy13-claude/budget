/**
 * type-summary-fx.test.ts — one row whose currency has no rate must not take
 * the whole type summary down (Phase 13 review WR-10).
 */
import { describe, test, expect } from "bun:test";
import { typeSummary } from "../../src/application/history-queries";
import type { HistoryRepo } from "../../src/ports/history-repo";

describe("Type summary FX isolation", () => {
  test("a row without a rate is skipped; the others are still summed", async () => {
    const historyRepo = {
      realizedByType: async () => [
        {
          uiType: "crypto",
          budgetCurrency: "PLN",
          realizedBudgetCents: 100n,
          soldCostBudgetCents: 50n,
        },
        {
          uiType: "stocks",
          budgetCurrency: "XXX",
          realizedBudgetCents: 7n,
          soldCostBudgetCents: 7n,
        },
      ],
      getTypeOrder: async () => [],
    } as unknown as HistoryRepo;
    const fxProvider = {
      rateAsOf: async () => {
        throw new Error("no rate");
      },
    } as never;
    const r = await typeSummary({ historyRepo, fxProvider })({
      tenantId: "t",
      budgetId: "t",
      actorUserId: "u",
      budgetCurrency: "PLN",
    });
    expect(r._unsafeUnwrap().types).toEqual({
      crypto: { realizedBudgetCents: "100", soldCostBudgetCents: "50" },
    });
  });
});

// Round-6 gap 6: each asset's own realized, the same sum the header uses.
describe("Per-asset realized", () => {
  test("holdings sum per asset; types still sum per type", async () => {
    const row = (holdingId: string, r: bigint, s: bigint, ccy = "PLN") => ({
      uiType: "stocks",
      holdingId,
      budgetCurrency: ccy,
      realizedBudgetCents: r,
      soldCostBudgetCents: s,
    });
    const historyRepo = {
      realizedByType: async () => [
        row("A", 100n, 400n),
        row("B", -40n, 100n),
        row("B", 10n, 10n, "EUR"),
      ],
      getTypeOrder: async () => [],
    } as unknown as HistoryRepo;
    const fxProvider = {
      rateAsOf: async () => ({ rate: "4", provider: "s", isStale: false }),
    } as never;
    const r = (
      await typeSummary({ historyRepo, fxProvider })({
        tenantId: "t",
        budgetId: "t",
        actorUserId: "u",
        budgetCurrency: "PLN",
      })
    )._unsafeUnwrap();
    expect(r.types.stocks).toEqual({
      realizedBudgetCents: "100",
      soldCostBudgetCents: "540",
    });
    expect(r.holdings).toEqual({
      A: { realizedBudgetCents: "100", soldCostBudgetCents: "400" },
      B: { realizedBudgetCents: "0", soldCostBudgetCents: "140" },
    });
  });
});
