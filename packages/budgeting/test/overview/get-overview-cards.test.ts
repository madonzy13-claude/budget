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

const reservesDto = {
  totals: {
    internalCents: "5000",
    userDefinedCents: "5000",
    surplusCents: "0",
    direction: "NONE" as const,
    disabled: false,
  },
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
    reservesSummary: async () =>
      ok(reservesDto) as Result<typeof reservesDto, Error>,
    upcomingByCategory: async () => new Map<string, bigint>(),
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

  test("available-to-spend adds CUSHION wallets when cushion mode is on (r36)", async () => {
    const d = deps();
    d.metaReader = {
      async getBudgetMeta() {
        return { default_currency: "USD", cushion_mode_enabled: true };
      },
    };
    const dto = (await getOverviewCards(d)(input))._unsafeUnwrap();
    // SPENDINGS 10000 + CUSHION 3000 (mode on) = 13000; RESERVE still excluded.
    expect(dto.available_to_spend_cents).toBe(13000n);
  });

  test("available-reserves sums only RESERVE wallets", async () => {
    const r = await getOverviewCards(deps())(input);
    expect(r._unsafeUnwrap().available_reserves_cents).toBe(5000n);
  });

  test("spendings breakdown: spent + budget-left + wallet + good flag (item 1)", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    // r36: left_cents is PER-CATEGORY max(leftover, upcoming), NOT the net.
    // a: leftover 10000−12000 = −2000 → 0; b: 8000−5000 = 3000; no upcoming → 3000.
    // (Old netting cancelled b's 3000 against a's −2000 → 1000; that hid money.)
    expect(dto.spendings.spent_cents).toBe(17000n);
    expect(dto.spendings.left_cents).toBe(3000n);
    expect(dto.spendings.wallet_cents).toBe(10000n);
    expect(dto.spendings.good).toBe(true); // 10000 ≥ 3000
  });

  test("left_cents = Σ per-category max(leftover, upcoming) incl. uncategorised (r36)", async () => {
    const d = deps();
    // a leftover 0 (overspent), upcoming 1500 → 1500 (upcoming wins).
    // b leftover 3000, upcoming 1000 → 3000 (leftover wins, no double count).
    // uncategorised upcoming 700 → added directly.
    d.upcomingByCategory = async () =>
      new Map<string, bigint>([
        ["a", 1500n],
        ["b", 1000n],
        ["__none__", 700n],
      ]);
    const dto = (await getOverviewCards(d)(input))._unsafeUnwrap();
    expect(dto.spendings.left_cents).toBe(5200n); // 1500 + 3000 + 700
  });

  test("spendings.good is false when wallets can't cover what's left", async () => {
    const d = deps();
    d.walletRepo = {
      async listWalletsWithType() {
        return [
          {
            amount_cents: 500n,
            currency: "USD",
            wallet_type: "SPENDINGS" as const,
          },
        ];
      },
    };
    const dto = (await getOverviewCards(d)(input))._unsafeUnwrap();
    expect(dto.spendings.wallet_cents).toBe(500n);
    expect(dto.spendings.good).toBe(false); // 500 < 3000 left
  });

  test("reserves health: required vs wallet + status (item 3)", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.reserves.required_cents).toBe(5000n);
    expect(dto.reserves.wallet_cents).toBe(5000n);
    expect(dto.reserves.status).toBe("ok"); // direction NONE
  });

  test("reserves status maps TOPUP→short, WITHDRAW→surplus", async () => {
    const short = deps();
    short.reservesSummary = async () =>
      ok({
        totals: { ...reservesDto.totals, direction: "TOPUP" as const },
      }) as Result<typeof reservesDto, Error>;
    expect(
      (await getOverviewCards(short)(input))._unsafeUnwrap().reserves.status,
    ).toBe("short");

    const surplus = deps();
    surplus.reservesSummary = async () =>
      ok({
        totals: { ...reservesDto.totals, direction: "WITHDRAW" as const },
      }) as Result<typeof reservesDto, Error>;
    expect(
      (await getOverviewCards(surplus)(input))._unsafeUnwrap().reserves.status,
    ).toBe("surplus");
  });

  test("capitalization = Σ all wallets + investment value; investment_value separate", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.investment_value_cents).toBe(10000n);
    expect(dto.capitalization_cents).toBe(28000n); // 18000 wallets + 10000 investments
  });

  test("retirement_months = inflation-adjusted drawdown of capitalization (items 5+8)", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    // planned 10000 + 8000 = 18000; runway uses the FULL capitalization 28000
    // (wallets + investments), spending grows at 4.5%/yr →
    // N = ln(1 + W·r/s)/ln(1+r), r = monthly inflation.
    const r = Math.pow(1.045, 1 / 12) - 1;
    const expected = Math.log(1 + (28000 * r) / 18000) / Math.log(1 + r);
    expect(dto.retirement_months).toBeCloseTo(expected, 4);
    expect(dto.retirement_inflation_pct).toBe(4.5);
    // inflation shortens the runway vs the flat 28000/18000.
    expect(dto.retirement_months!).toBeLessThan(28000 / 18000);
  });

  test("retirement_months is null when there's no planned spend", async () => {
    const d = deps();
    d.spendingsSummary = async () =>
      ok({
        ...spendingsDto,
        categories: spendingsDto.categories.map((c) => ({
          ...c,
          plannedCents: "0",
        })),
      }) as Result<typeof spendingsDto, Error>;
    const dto = (await getOverviewCards(d)(input))._unsafeUnwrap();
    expect(dto.retirement_months).toBeNull();
  });

  test("cushion real_months = actual / (required / target_months); total = actual", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.cushion.enabled).toBe(true);
    expect(dto.cushion.real_months).toBeCloseTo(3.0, 5);
    expect(dto.cushion.total_cents).toBe(30000n);
    expect(dto.cushion.required_cents).toBe(60000n);
    // actual (30000) < required (60000) → not covered.
    expect(dto.cushion.covered).toBe(false);
  });

  test("cushion.covered = true once actual ≥ required", async () => {
    const d = deps();
    d.cushionSummary = async () =>
      ok({ ...cushionDto, actual_cents: "60000" }) as Result<
        typeof cushionDto,
        Error
      >;
    const dto = (await getOverviewCards(d)(input))._unsafeUnwrap();
    expect(dto.cushion.covered).toBe(true);
  });

  test("overspent card uses after-reserves overspent, excludes archived (D-06)", async () => {
    const dto = (await getOverviewCards(deps())(input))._unsafeUnwrap();
    expect(dto.overspent.count).toBe(1);
    expect(dto.overspent.currency).toBe("USD");
    expect(dto.overspent.total_cents).toBe(2000n); // Σ overspend (item 5)
    expect(dto.overspent.top.map((t) => t.category_id)).toEqual(["a"]);
    expect(dto.overspent.top[0]!.over_amount_cents).toBe(2000n);
  });
});
