/**
 * reserves-use-cases.test.ts — Unit tests for Phase 5 Plan 03 reserve use cases.
 * Port-level mocks (allowed at application layer — no DB mocks at adapter layer).
 * Plan 05-03. UAT-PH5-T3-54: rewritten for stored-actual architecture pivot.
 */
import { describe, it, expect } from "bun:test";

const noopRepoMethods = {
  create: async () => {},
  list: async () => [],
  archive: async () => {},
  setBalance: async () => {},
  update: async () => {},
};

function mockCategoriesRepo(opts: {
  findById?: any;
  list?: any[];
  capture?: { exclude?: boolean; actualUpdates?: Map<string, bigint> };
}) {
  return {
    findById: opts.findById ?? (async () => null),
    list: async () => opts.list ?? [],
    setReserveExcluded: async () => {
      if (opts.capture) opts.capture.exclude = true;
    },
    setReserveActualMany: async (
      _tenantId: string,
      updates: Map<string, bigint>,
    ) => {
      if (opts.capture) opts.capture.actualUpdates = updates;
    },
  };
}

function mockReserveBalanceRepo(opts: {
  active?: Map<string, any>;
  excluded?: Map<string, any>;
}) {
  return {
    getForBudget: async () => opts.active ?? new Map(),
    getExcludedForBudget: async () => opts.excluded ?? new Map(),
    getForCategory: async () => ({ amount: { toString: () => "0" } }) as any,
  };
}

// ---------------------------------------------------------------------------
// updateWallet use case (unchanged contract; tests preserved)
// ---------------------------------------------------------------------------
describe("updateWallet use case", () => {
  it("returns not_found when wallet does not exist", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const repo = { ...noopRepoMethods, findById: async () => null } as any;
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      name: "New Name",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns reserve_currency_mismatch when RESERVE wallet patches non-budget currency", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "Reserve",
      "RESERVE",
      "EUR",
      Money.of("100", "EUR"),
      null,
      new Date(),
      "u1",
    );
    const repo = { ...noopRepoMethods, findById: async () => wallet } as any;
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      currency: "USD",
    });
    expect(r.isErr() && r.error.message).toBe("reserve_currency_mismatch");
  });
});

// ---------------------------------------------------------------------------
// adjustCategoryReserve — UAT-PH5-T3-54 target-value contract
// ---------------------------------------------------------------------------
describe("adjustCategoryReserve use case", () => {
  const baseInput = {
    tenantId: "t1",
    budgetId: "t1",
    categoryId: "c1",
    expectedCents: 100,
    actorUserId: "u1",
  };

  function buildDeps(overrides: any = {}) {
    return {
      adjustmentsRepo: {
        create: async () => ({ id: "adj-x", occurredAt: new Date() }),
        listForCategory: async () => [],
        ...(overrides.adjustmentsRepo ?? {}),
      },
      categoriesRepo: overrides.categoriesRepo ?? mockCategoriesRepo({}),
      reserveBalanceRepo:
        overrides.reserveBalanceRepo ?? mockReserveBalanceRepo({}),
      reservesSummaryRepo: {
        sumReserveWalletAmounts: async () => 0n,
        ...(overrides.reservesSummaryRepo ?? {}),
      },
      isReservesEnabled: overrides.isReservesEnabled ?? (async () => true),
    };
  }

  it("returns reserves_disabled when reserves are disabled", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(
      buildDeps({ isReservesEnabled: async () => false }),
    );
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("reserves_disabled");
  });

  it("returns not_found when category does not exist", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(buildDeps({}));
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns category_excluded when reserveExcluded=true", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(
      buildDeps({
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "X",
            reserveExcluded: true,
            archivedAt: null,
            sortIndex: 0,
            reserveActualCents: 0n,
          }),
        }),
      }),
    );
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("category_excluded");
  });

  it("writes delta to ledger AND mutates reserve_actual_cents on raise within free pool", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const { Money } = await import("@budget/shared-kernel");
    const capture: any = {};
    let ledgerDelta: bigint | null = null;

    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async (i: any) => {
            ledgerDelta = i.deltaCents;
            return { id: "adj-x", occurredAt: new Date() };
          },
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "Food",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 1,
            reserveActualCents: 100n,
          }),
          list: [
            {
              id: "c1",
              name: "Food",
              reserveExcluded: false,
              sortIndex: 1,
              reserveActualCents: 100n,
            },
          ],
          capture,
        }),
        reserveBalanceRepo: mockReserveBalanceRepo({
          active: new Map([["c1", Money.of("1.00", "EUR")]]),
        }),
        reservesSummaryRepo: { sumReserveWalletAmounts: async () => 1000n },
      }),
    );

    // Raise expected 100c → 500c. Free pool = 1000 - 100 = 900. Deficit = 400.
    // Actual: 100 + min(400, 900) = 500.
    const r = await uc({ ...baseInput, expectedCents: 500 });
    expect(r.isOk()).toBe(true);
    expect(ledgerDelta).toBe(400n);
    expect(capture.actualUpdates?.get("c1")).toBe(500n);
  });

  it("user scenario T3-54: pool=17, H=2, G=9, bump G→25 keeps H at 200c", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const { Money } = await import("@budget/shared-kernel");
    const capture: any = {};

    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async () => ({ id: "x", occurredAt: new Date() }),
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "G",
            name: "Groceries",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 2,
            reserveActualCents: 900n,
          }),
          list: [
            {
              id: "H",
              name: "Housing",
              reserveExcluded: false,
              sortIndex: 1,
              reserveActualCents: 200n,
            },
            {
              id: "G",
              name: "Groceries",
              reserveExcluded: false,
              sortIndex: 2,
              reserveActualCents: 900n,
            },
          ],
          capture,
        }),
        reserveBalanceRepo: mockReserveBalanceRepo({
          active: new Map([
            ["H", Money.of("2.00", "EUR")],
            ["G", Money.of("9.00", "EUR")],
          ]),
        }),
        reservesSummaryRepo: { sumReserveWalletAmounts: async () => 1700n },
      }),
    );
    const r = await uc({
      ...baseInput,
      categoryId: "G",
      expectedCents: 2500,
    });
    expect(r.isOk()).toBe(true);
    // G.actual: 900 + min(2500-900=1600, 1700-200-900=600) = 1500.
    expect(capture.actualUpdates?.get("G")).toBe(1500n);
    // H is untouched.
    expect(capture.actualUpdates?.has("H")).toBe(false);
    if (r.isOk()) {
      expect(r.value.expectedCents).toBe("2500");
      expect(r.value.actualCents).toBe("1500");
      expect(r.value.deltaCents).toBe("1600");
    }
  });

  it("lowering expected below actual: clamp and spill to underfunded siblings", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const { Money } = await import("@budget/shared-kernel");
    const capture: any = {};
    const uc = adjustCategoryReserve(
      buildDeps({
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "B",
            name: "B",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 2,
            reserveActualCents: 200n,
          }),
          list: [
            {
              id: "A",
              name: "A",
              reserveExcluded: false,
              sortIndex: 1,
              reserveActualCents: 50n,
            },
            {
              id: "B",
              name: "B",
              reserveExcluded: false,
              sortIndex: 2,
              reserveActualCents: 200n,
            },
          ],
          capture,
        }),
        reserveBalanceRepo: mockReserveBalanceRepo({
          active: new Map([
            ["A", Money.of("1.00", "EUR")],
            ["B", Money.of("2.00", "EUR")],
          ]),
        }),
        reservesSummaryRepo: { sumReserveWalletAmounts: async () => 250n },
      }),
    );
    const r = await uc({
      ...baseInput,
      categoryId: "B",
      expectedCents: 100, // lower below actual=200
    });
    expect(r.isOk()).toBe(true);
    expect(capture.actualUpdates?.get("B")).toBe(100n); // clamped
    expect(capture.actualUpdates?.get("A")).toBe(100n); // 50→100 via 50c spill
  });
});

// ---------------------------------------------------------------------------
// toggleCategoryReserveExcluded
// ---------------------------------------------------------------------------
describe("toggleCategoryReserveExcluded use case", () => {
  it("returns not_found when category is null (RLS cross-tenant)", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({}),
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "c1",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("on exclude with non-zero actual: releases actual and refills siblings", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const { Money } = await import("@budget/shared-kernel");
    const capture: any = {};
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({
        findById: async () => ({
          id: "B",
          name: "B",
          reserveExcluded: false,
          archivedAt: null,
          sortIndex: 2,
          reserveActualCents: 200n,
        }),
        list: [
          {
            id: "A",
            name: "A",
            reserveExcluded: false,
            sortIndex: 1,
            reserveActualCents: 50n,
          },
          {
            id: "B",
            name: "B",
            reserveExcluded: false,
            sortIndex: 2,
            reserveActualCents: 200n,
          },
        ],
        capture,
      }),
      reserveBalanceRepo: mockReserveBalanceRepo({
        active: new Map([
          ["A", Money.of("1.00", "EUR")],
          ["B", Money.of("2.00", "EUR")],
        ]),
      }),
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "B",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    // B released 200, A deficit was 50, A becomes 100. B actual = 0.
    expect(capture.actualUpdates?.get("B")).toBe(0n);
    expect(capture.actualUpdates?.get("A")).toBe(100n);
    expect(capture.exclude).toBe(true);
  });

  it("on include (un-exclude): does NOT touch actual (user must re-fund)", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const capture: any = {};
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({
        findById: async () => ({
          id: "B",
          name: "B",
          reserveExcluded: true,
          archivedAt: null,
          sortIndex: 2,
          reserveActualCents: 0n,
        }),
        capture,
      }),
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "B",
      excluded: false,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    expect(capture.actualUpdates).toBeUndefined();
    expect(capture.exclude).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getReservesSummary — UAT-PH5-T3-54 reads stored actual directly
// ---------------------------------------------------------------------------
describe("getReservesSummary use case", () => {
  it("returns disabled=true with empty rows when reserves_enabled=false", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reserveBalanceRepo: mockReserveBalanceRepo({}),
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 0n },
      categoriesRepo: mockCategoriesRepo({}),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => false,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows).toEqual([]);
      expect(r.value.totals.disabled).toBe(true);
      expect(r.value.totals.budgetCurrency).toBe("EUR");
    }
  });

  it("returns walletShareAmount = stored actualCents, NOT computed via walk", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const uc = getReservesSummary({
      reserveBalanceRepo: mockReserveBalanceRepo({
        active: new Map([
          ["H", Money.of("2.00", "EUR")],
          ["G", Money.of("25.00", "EUR")],
        ]),
      }),
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 1700n },
      categoriesRepo: mockCategoriesRepo({
        list: [
          {
            id: "H",
            name: "Housing",
            reserveExcluded: false,
            sortIndex: 1,
            reserveActualCents: 200n,
          },
          {
            id: "G",
            name: "Groceries",
            reserveExcluded: false,
            sortIndex: 2,
            reserveActualCents: 1500n,
          },
        ],
      }),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const H = r.value.rows.find((x) => x.categoryId === "H")!;
      const G = r.value.rows.find((x) => x.categoryId === "G")!;
      expect(H.reserveBalanceCents).toBe("200");
      expect(H.walletShareAmountCents).toBe("200");
      expect(G.reserveBalanceCents).toBe("2500");
      expect(G.walletShareAmountCents).toBe("1500");
      expect(r.value.totals.totalCategoryReservesCents).toBe("2700");
      expect(r.value.totals.totalReserveWalletAmountCents).toBe("1700");
      expect(r.value.totals.mismatchCents).toBe("-1000");
    }
  });

  it("null share values when Σ active actual=0", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const uc = getReservesSummary({
      reserveBalanceRepo: mockReserveBalanceRepo({
        active: new Map([["A", Money.of("1.00", "EUR")]]),
      }),
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 100n },
      categoriesRepo: mockCategoriesRepo({
        list: [
          {
            id: "A",
            name: "Food",
            reserveExcluded: false,
            sortIndex: 1,
            reserveActualCents: 0n,
          },
        ],
      }),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows[0].walletSharePercent).toBeNull();
      expect(r.value.rows[0].walletShareAmountCents).toBeNull();
    }
  });

  it("share % computed from Σ active actual (NOT wallet pool)", async () => {
    // User's scenario: wallet=17, G.actual=12, H.actual=1. Σactual=13.
    // G should show 12/13 = 92.31% (≈92%); H should show 1/13 = 7.69% (≈8%).
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const uc = getReservesSummary({
      reserveBalanceRepo: mockReserveBalanceRepo({
        active: new Map([
          ["G", Money.of("25.00", "EUR")],
          ["H", Money.of("2.00", "EUR")],
        ]),
      }),
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 1700n },
      categoriesRepo: mockCategoriesRepo({
        list: [
          {
            id: "G",
            name: "Groceries",
            reserveExcluded: false,
            sortIndex: 0,
            reserveActualCents: 1200n,
          },
          {
            id: "H",
            name: "Housing",
            reserveExcluded: false,
            sortIndex: 1,
            reserveActualCents: 100n,
          },
        ],
      }),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const G = r.value.rows.find((x) => x.categoryId === "G")!;
      const H = r.value.rows.find((x) => x.categoryId === "H")!;
      expect(G.walletSharePercent).toBeCloseTo(92.3, 1);
      expect(H.walletSharePercent).toBeCloseTo(7.69, 1);
      expect(G.walletShareAmountCents).toBe("1200");
      expect(H.walletShareAmountCents).toBe("100");
    }
  });

  it("excludedRows show frozen real expected; not in totals (W-3)", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const uc = getReservesSummary({
      reserveBalanceRepo: mockReserveBalanceRepo({
        active: new Map([["A", Money.of("3.00", "EUR")]]),
        excluded: new Map([["X", Money.of("5.00", "EUR")]]),
      }),
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 300n },
      categoriesRepo: mockCategoriesRepo({
        list: [
          {
            id: "A",
            name: "A",
            reserveExcluded: false,
            sortIndex: 1,
            reserveActualCents: 300n,
          },
          {
            id: "X",
            name: "Excl",
            reserveExcluded: true,
            sortIndex: 2,
            reserveActualCents: 0n,
          },
        ],
      }),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows.length).toBe(1);
      expect(r.value.excludedRows.length).toBe(1);
      expect(r.value.excludedRows[0].reserveBalanceCents).toBe("500");
      expect(r.value.excludedRows[0].walletSharePercent).toBeNull();
      expect(r.value.totals.totalCategoryReservesCents).toBe("300");
    }
  });
});
