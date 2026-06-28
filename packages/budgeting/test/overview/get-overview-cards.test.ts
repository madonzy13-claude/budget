/**
 * get-overview-cards.test.ts — RED (11-03 Task 1).
 *
 * The 5-card Overview summary, all amounts in budget default_currency (D-11, NOT
 * display_currency):
 *   - available_to_spend = Σ SPENDINGS wallets
 *   - available_reserves = Σ RESERVE wallets
 *   - capitalization     = Σ ALL wallets + investment value
 *   - cushion            = real_months + total (from cushion-summary; no new math)
 *   - overspent          = after-reserves top-N + count, archived EXCLUDED (D-06/D-10)
 * bigint through the service; route stringifies.
 */
import { describe, test, expect } from "bun:test";
import { ok, type Result } from "@budget/shared-kernel";
import {
  getOverviewCards,
  type GetOverviewCardsDeps,
} from "@budget/budgeting/src/application/get-overview-cards";

function fxProvider() {
  return {
    async rateAsOf(from: string, to: string) {
      return {
        rate: from === to ? "1" : "1",
        provider: "stub",
        isStale: false,
      };
    },
  };
}

const cushionDto = {
  required_cents: "60000",
  actual_cents: "30000",
  shortfall_cents: "30000",
  currency: "USD",
  enabled: true,
  target_months: 6,
};

const spendingsDto = {
  month: "2026-06",
  budgetCurrency: "USD",
  budgetTz: "UTC",
  cushionModeEnabled: false,
  categories: [
    {
      categoryId: "a",
      name: "Groceries",
      archived: false,
      overspentCents: "2000",
      spentCents: "12000",
      activeBudgetCents: "10000",
      reserveUsedCents: "0",
      reserveAvailableCents: "0",
      reserveExcluded: false,
      plannedCents: "10000",
      cushionCents: "10000",
      balanceCents: "0",
      iconKey: null,
      colorKey: null,
      sortIndex: 0,
    },
    {
      categoryId: "b",
      name: "Transport",
      archived: false,
      overspentCents: "0",
      spentCents: "5000",
      activeBudgetCents: "8000",
      reserveUsedCents: "0",
      reserveAvailableCents: "0",
      reserveExcluded: false,
      plannedCents: "8000",
      cushionCents: "8000",
      balanceCents: "3000",
      iconKey: null,
      colorKey: null,
      sortIndex: 1,
    },
    {
      categoryId: "c",
      name: "OldRent",
      archived: true,
      overspentCents: "5000",
      spentCents: "5000",
      activeBudgetCents: "0",
      reserveUsedCents: "0",
      reserveAvailableCents: "0",
      reserveExcluded: false,
      plannedCents: "0",
      cushionCents: "0",
      balanceCents: "0",
      iconKey: null,
      colorKey: null,
      sortIndex: 2,
    },
  ],
};

function deps(): GetOverviewCardsDeps {
  return {
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "USD", cushion_mode_enabled: false };
      },
    },
    walletRepo: {
      async listWalletsWithType() {
        return [
          {
            amount_cents: 10000n,
            currency: "USD",
            wallet_type: "SPENDINGS" as const,
          },
          {
            amount_cents: 5000n,
            currency: "USD",
            wallet_type: "RESERVE" as const,
          },
          {
            amount_cents: 3000n,
            currency: "USD",
            wallet_type: "CUSHION" as const,
          },
        ];
      },
    },
    holdingsValuation: {
      async investmentValueCents() {
        return 10000n;
      },
    },
    fxProvider: fxProvider() as GetOverviewCardsDeps["fxProvider"],
    cushionSummary: async () =>
      ok(cushionDto) as Result<typeof cushionDto, Error>,
    spendingsSummary: async () =>
      ok(spendingsDto) as Result<typeof spendingsDto, Error>,
    now: () => new Date("2026-06-15T00:00:00Z"),
  };
}

const input = { tenantId: "b1", budgetId: "b1" };

describe("Overview cards", () => {
  test("available-to-spend sums only SPENDINGS wallets in default_currency", async () => {
    const r = await getOverviewCards(deps())(input);
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().available_to_spend_cents).toBe(10000n);
    expect(r._unsafeUnwrap().default_currency).toBe("USD");
  });

  test("available-reserves sums only RESERVE wallets", async () => {
    const r = await getOverviewCards(deps())(input);
    expect(r._unsafeUnwrap().available_reserves_cents).toBe(5000n);
  });

  test("capitalization = Σ all wallets + investment value; investment_value separate", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.investment_value_cents).toBe(10000n);
    expect(dto.capitalization_cents).toBe(28000n); // 18000 wallets + 10000 investments
  });

  test("cushion real_months = actual / (required / target_months); total = actual", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.cushion.enabled).toBe(true);
    expect(dto.cushion.real_months).toBeCloseTo(3.0, 5);
    expect(dto.cushion.total_cents).toBe(30000n);
  });

  test("overspent card uses after-reserves overspent, excludes archived (D-06)", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.overspent.count).toBe(1);
    expect(dto.overspent.currency).toBe("USD");
    expect(dto.overspent.top.map((t) => t.category_id)).toEqual(["a"]);
    expect(dto.overspent.top[0]!.over_amount_cents).toBe(2000n);
  });
});
