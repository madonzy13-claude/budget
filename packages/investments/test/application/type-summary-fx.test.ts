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
