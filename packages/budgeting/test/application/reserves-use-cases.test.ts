/**
 * reserves-use-cases.test.ts — Unit tests for Phase 5 Plan 03 use cases.
 * Port-level mocks (allowed at application layer — no DB mocks at adapter layer).
 * TDD RED phase: tests written before implementation exists.
 * Plan 05-03.
 */
import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// updateWallet use case (imports will fail until implementation exists)
// ---------------------------------------------------------------------------
describe("updateWallet use case", () => {
  it("returns not_found when wallet does not exist", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const repo = {
      findById: async () => null,
      create: async () => {},
      list: async () => [],
      archive: async () => {},
      setBalance: async () => {},
      update: async () => {},
    };
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

  it("returns reserve_currency_mismatch when RESERVE wallet gets non-budget currency", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "My Wallet",
      "RESERVE",
      "EUR",
      Money.of("100", "EUR"),
      null,
      new Date(),
      "u1",
    );
    const repo = {
      findById: async () => wallet,
      create: async () => {},
      list: async () => [],
      archive: async () => {},
      setBalance: async () => {},
      update: async () => {},
    };
    // Budget currency is EUR but patch changes currency to USD
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      currency: "USD", // mismatch — wallet stays RESERVE but currency changes to non-EUR
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("reserve_currency_mismatch");
  });

  it("returns reserve_currency_mismatch when changing type to RESERVE on non-budget-currency wallet", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "USD Wallet",
      "SPENDINGS",
      "USD",
      Money.of("0", "USD"),
      null,
      new Date(),
      "u1",
    );
    const repo = {
      findById: async () => wallet,
      create: async () => {},
      list: async () => [],
      archive: async () => {},
      setBalance: async () => {},
      update: async () => {},
    };
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      walletType: "RESERVE", // changing to RESERVE but currency is USD != EUR
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("reserve_currency_mismatch");
  });

  it("returns ok when RESERVE wallet keeps budget currency", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "EUR Reserve",
      "RESERVE",
      "EUR",
      Money.of("500", "EUR"),
      null,
      new Date(),
      "u1",
    );
    let updated = false;
    const repo = {
      findById: async () => wallet,
      create: async () => {},
      list: async () => [],
      archive: async () => {},
      setBalance: async () => {},
      update: async () => {
        updated = true;
      },
    };
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      name: "Renamed Reserve",
    });
    expect(r.isOk()).toBe(true);
    expect(updated).toBe(true);
  });

  it("Pitfall 4: fires reserve-currency check when only amount changes on RESERVE wallet", async () => {
    // Even if only amount changes, effective type is still RESERVE → must check
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "Bad Reserve",
      "RESERVE",
      "USD", // bad: budget currency is EUR but wallet has USD
      Money.of("100", "USD"),
      null,
      new Date(),
      "u1",
    );
    const repo = {
      findById: async () => wallet,
      create: async () => {},
      list: async () => [],
      archive: async () => {},
      setBalance: async () => {},
      update: async () => {},
    };
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    // Only changing amount — but wallet is RESERVE with wrong currency
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      amount: "200",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("reserve_currency_mismatch");
  });
});

// ---------------------------------------------------------------------------
// adjustCategoryReserve use case
// ---------------------------------------------------------------------------
describe("adjustCategoryReserve use case", () => {
  it("returns not_found when category does not exist", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve({
      adjustmentsRepo: {
        create: async () => ({ id: "x", occurredAt: new Date() }),
        listForCategory: async () => [],
      },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
      isReservesEnabled: async () => true,
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      deltaCents: 100,
      actorUserId: "u1",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns category_excluded when category has reserveExcluded=true", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const mockCat = { id: "c1", reserveExcluded: true };
    const uc = adjustCategoryReserve({
      adjustmentsRepo: {
        create: async () => ({ id: "x", occurredAt: new Date() }),
        listForCategory: async () => [],
      },
      categoriesRepo: {
        findById: async () => mockCat as any,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
      isReservesEnabled: async () => true,
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      deltaCents: 100,
      actorUserId: "u1",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("category_excluded");
  });

  it("returns reserves_disabled when reserves are disabled", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve({
      adjustmentsRepo: {
        create: async () => ({ id: "x", occurredAt: new Date() }),
        listForCategory: async () => [],
      },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
      isReservesEnabled: async () => false,
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      deltaCents: 100,
      actorUserId: "u1",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("reserves_disabled");
  });

  it("returns ok with id + occurredAt on success", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const now = new Date("2026-01-01T00:00:00Z");
    const uc = adjustCategoryReserve({
      adjustmentsRepo: {
        create: async () => ({ id: "adj-1", occurredAt: now }),
        listForCategory: async () => [],
      },
      categoriesRepo: {
        findById: async () => ({ id: "c1", reserveExcluded: false }) as any,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
      isReservesEnabled: async () => true,
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      deltaCents: 50000,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.id).toBe("adj-1");
      expect(r.value.occurredAt).toBe(now.toISOString());
    }
  });
});

// ---------------------------------------------------------------------------
// toggleCategoryReserveExcluded use case
// ---------------------------------------------------------------------------
describe("toggleCategoryReserveExcluded use case", () => {
  it("returns not_found when category is null (RLS cross-tenant scenario)", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const uc = toggleCategoryReserveExcluded({
      repo: {
        findById: async () => null,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns ok with categoryId + reserveExcluded on success", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    let setExcludedCalled = false;
    const uc = toggleCategoryReserveExcluded({
      repo: {
        findById: async () => ({ id: "c1" }) as any,
        list: async () => [],
        setReserveExcluded: async () => {
          setExcludedCalled = true;
        },
      },
    });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.categoryId).toBe("c1");
      expect(r.value.reserveExcluded).toBe(true);
    }
    expect(setExcludedCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getReservesSummary use case
// ---------------------------------------------------------------------------
describe("getReservesSummary use case", () => {
  it("returns disabled=true with empty rows when reserves_enabled=false", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reserveBalanceRepo: {
        getForBudget: async () => new Map(),
        getExcludedForBudget: async () => new Map(),
        getForCategory: async () =>
          ({ amount: { toString: () => "0" } }) as any,
      },
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 0n },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [],
        setReserveExcluded: async () => {},
      },
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => false,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows).toEqual([]);
      expect(r.value.excludedRows).toEqual([]);
      expect(r.value.totals.disabled).toBe(true);
      expect(r.value.totals.budgetCurrency).toBe("EUR");
    }
  });

  it("computes share math for Active categories (D-PH5-R2)", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    // 2 active categories: 30000c and 70000c; RESERVE wallet sum = 100000c
    const activeMap = new Map([
      ["cat-1", Money.of("300.00", "EUR")], // 30000 cents
      ["cat-2", Money.of("700.00", "EUR")], // 70000 cents
    ]);
    const uc = getReservesSummary({
      reserveBalanceRepo: {
        getForBudget: async () => activeMap,
        getExcludedForBudget: async () => new Map(),
        getForCategory: async () => Money.of("0", "EUR"),
      },
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 100000n },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [
          { id: "cat-1", name: "Food", reserveExcluded: false } as any,
          { id: "cat-2", name: "Rent", reserveExcluded: false } as any,
        ],
        setReserveExcluded: async () => {},
      },
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows.length).toBe(2);
      const cat1 = r.value.rows.find((row) => row.categoryId === "cat-1")!;
      const cat2 = r.value.rows.find((row) => row.categoryId === "cat-2")!;
      expect(cat1.reserveBalanceCents).toBe("30000");
      expect(cat2.reserveBalanceCents).toBe("70000");
      expect(cat1.walletSharePercent).toBeCloseTo(30, 1);
      expect(cat2.walletSharePercent).toBeCloseTo(70, 1);
      expect(r.value.totals.totalCategoryReservesCents).toBe("100000");
      expect(r.value.totals.totalReserveWalletAmountCents).toBe("100000");
      expect(r.value.totals.mismatchCents).toBe("0");
    }
  });

  it("returns null share values when Σ Active reserves = 0 (D-PH5-R4)", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reserveBalanceRepo: {
        getForBudget: async () => new Map(), // no balances = 0
        getExcludedForBudget: async () => new Map(),
        getForCategory: async () =>
          ({ amount: { toString: () => "0" } }) as any,
      },
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 100000n },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [
          { id: "cat-1", name: "Food", reserveExcluded: false } as any,
        ],
        setReserveExcluded: async () => {},
      },
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

  it("W-3: excludedRows contain REAL FROZEN balance (not zero)", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const excludedMap = new Map([
      ["cat-exc", Money.of("500.00", "EUR")], // 50000 cents frozen
    ]);
    const uc = getReservesSummary({
      reserveBalanceRepo: {
        getForBudget: async () => new Map(),
        getExcludedForBudget: async () => excludedMap,
        getForCategory: async () => Money.of("0", "EUR"),
      },
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 0n },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [
          { id: "cat-exc", name: "Excluded Cat", reserveExcluded: true } as any,
        ],
        setReserveExcluded: async () => {},
      },
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows).toEqual([]); // no active cats
      expect(r.value.excludedRows.length).toBe(1);
      expect(r.value.excludedRows[0].reserveBalanceCents).toBe("50000");
      expect(r.value.excludedRows[0].walletSharePercent).toBeNull();
      expect(r.value.excludedRows[0].walletShareAmountCents).toBeNull();
      // Totals exclude the excluded category balance
      expect(r.value.totals.totalCategoryReservesCents).toBe("0");
    }
  });

  it("W-3: mixed Active/Excluded — totals include ONLY Active balances", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const { Money } = await import("@budget/shared-kernel");
    const activeMap = new Map([
      ["cat-a", Money.of("300.00", "EUR")], // 30000 cents
      ["cat-b", Money.of("700.00", "EUR")], // 70000 cents
    ]);
    const excludedMap = new Map([
      ["cat-exc", Money.of("500.00", "EUR")], // 50000 cents — must NOT be in totals
    ]);
    const uc = getReservesSummary({
      reserveBalanceRepo: {
        getForBudget: async () => activeMap,
        getExcludedForBudget: async () => excludedMap,
        getForCategory: async () => Money.of("0", "EUR"),
      },
      reservesSummaryRepo: { sumReserveWalletAmounts: async () => 100000n },
      categoriesRepo: {
        findById: async () => null,
        list: async () => [
          { id: "cat-a", name: "Food", reserveExcluded: false } as any,
          { id: "cat-b", name: "Rent", reserveExcluded: false } as any,
          { id: "cat-exc", name: "Excl", reserveExcluded: true } as any,
        ],
        setReserveExcluded: async () => {},
      },
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.totals.totalCategoryReservesCents).toBe("100000"); // 30000 + 70000, NOT 150000
      expect(r.value.totals.mismatchCents).toBe("0"); // 100000 wallet - 100000 active
      expect(r.value.excludedRows[0].reserveBalanceCents).toBe("50000");
    }
  });
});
