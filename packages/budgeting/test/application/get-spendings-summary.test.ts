/**
 * get-spendings-summary.test.ts — Unit tests for getSpendingsSummary application service.
 * TDD RED phase — written before implementation.
 *
 * Tests the 5-row header math, RSCM-04 reserve cascade, budgetTz top-level field.
 */
import { describe, it, expect } from "bun:test";
import { getSpendingsSummary } from "../../src/application/get-spendings-summary";
import type { CategoryRepo } from "../../src/ports/category-repo";
import type { CategoryLimitRepo } from "../../src/ports/category-limit-repo";
import type { TransactionRepo } from "../../src/ports/transaction-repo";
import type { ReserveBalanceRepo } from "../../src/ports/reserve-balance-repo";
import type { SpendingsSummaryRepo } from "../../src/ports/spendings-summary-repo";
import type { ReservesSummaryRepo } from "../../src/ports/reserves-summary-repo";
import { Money } from "@budget/shared-kernel";

const TENANT = "tenant-1";
const BUDGET = "budget-1";
const CAT_A = "cat-aaaa-0000-0000-0000-000000000000";
const MONTH = "2026-05";

// Minimal Category-like objects for mocking
function makeCategory(id: string, sortIndex: number) {
  return {
    id,
    tenantId: TENANT,
    name: `Cat-${id}`,
    parentId: null,
    archivedAt: null,
    createdAt: new Date(),
    actorUserId: "u",
    sortIndex,
  };
}

function makeMeta(
  overrides: Partial<{
    cushionModeEnabled: boolean;
    currency: string;
    timezone: string;
  }> = {},
) {
  return {
    cushionModeEnabled: false,
    currency: "EUR",
    timezone: "UTC",
    ...overrides,
  };
}

function makeDeps(overrides: {
  categories?: any[];
  meta?: ReturnType<typeof makeMeta> | null;
  spend?: Map<string, bigint>;
  limits?: Map<string, { planned: bigint; cushion: bigint }>;
  reserves?: Map<string, Money>;
  /**
   * Real reserve-wallet pool in cents. Defaults to effectively unlimited so a
   * reconciled budget (Σ category reserves ≤ wallet pool) is unaffected; set a
   * smaller value to exercise the real-money cap.
   */
  reserveWalletTotalCents?: bigint;
}) {
  const categories = overrides.categories ?? [];
  const meta = overrides.meta !== undefined ? overrides.meta : makeMeta();
  const spend = overrides.spend ?? new Map();
  const limits = overrides.limits ?? new Map();
  const reserves = overrides.reserves ?? new Map();
  const reserveWalletTotalCents =
    overrides.reserveWalletTotalCents ?? 10n ** 18n; // ~unlimited by default

  const categoryRepo: Pick<CategoryRepo, "listForBudget"> = {
    listForBudget: async () => categories as any,
  };

  const categoryLimitRepo: Pick<CategoryLimitRepo, "effectiveForMonth"> = {
    effectiveForMonth: async () => limits,
  };

  const transactionRepo: Pick<TransactionRepo, "spendByCategoryForMonth"> = {
    spendByCategoryForMonth: async () => spend,
  };

  const reserveBalanceRepo: Pick<ReserveBalanceRepo, "getForBudget"> = {
    getForBudget: async () => reserves,
  };

  const summaryRepo: SpendingsSummaryRepo = {
    getBudgetMeta: async () => meta,
  };

  const reservesSummaryRepo: ReservesSummaryRepo = {
    sumReserveWalletAmounts: async () => reserveWalletTotalCents,
  };

  return {
    categoryRepo: categoryRepo as CategoryRepo,
    categoryLimitRepo: categoryLimitRepo as CategoryLimitRepo,
    transactionRepo: transactionRepo as TransactionRepo,
    reserveBalanceRepo: reserveBalanceRepo as ReserveBalanceRepo,
    summaryRepo,
    reservesSummaryRepo,
  };
}

describe("getSpendingsSummary", () => {
  it("returns err('invalid_month') for invalid month format", async () => {
    const svc = getSpendingsSummary(makeDeps({}));
    const r = await svc({
      tenantId: TENANT,
      budgetId: BUDGET,
      month: "05-2026",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("invalid_month");
  });

  it("returns err('budget_not_found') when meta is null", async () => {
    const svc = getSpendingsSummary(makeDeps({ meta: null }));
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("budget_not_found");
  });

  it("returns empty categories array when budget has no categories", async () => {
    const svc = getSpendingsSummary(makeDeps({ categories: [] }));
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.categories).toEqual([]);
      expect(r.value.month).toBe(MONTH);
    }
  });

  it("DTO includes budgetTz at top level matching meta.timezone", async () => {
    const svc = getSpendingsSummary(
      makeDeps({ meta: makeMeta({ timezone: "Europe/Warsaw" }) }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.budgetTz).toBe("Europe/Warsaw");
    }
  });

  it("DTO includes budgetCurrency at top level", async () => {
    const svc = getSpendingsSummary(
      makeDeps({ meta: makeMeta({ currency: "PLN" }) }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.budgetCurrency).toBe("PLN");
    }
  });

  it("cushion_mode_enabled=false: activeBudgetCents = plannedCents", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 15000n }]]);
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        meta: makeMeta({ cushionModeEnabled: false }),
        limits,
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.activeBudgetCents).toBe("10000");
      expect(cat.plannedCents).toBe("10000");
      expect(cat.cushionCents).toBe("15000");
    }
  });

  it("cushion_mode_enabled=true: activeBudgetCents = cushionCents", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 15000n }]]);
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        meta: makeMeta({ cushionModeEnabled: true }),
        limits,
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.activeBudgetCents).toBe("15000");
    }
  });

  it("category with no limit row → planned=0, cushion=0, active=0", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, limits: new Map() }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.plannedCents).toBe("0");
      expect(cat.cushionCents).toBe("0");
      expect(cat.activeBudgetCents).toBe("0");
    }
  });

  it("spentCents reflects spend map correctly", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 5000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.categories[0].spentCents).toBe("5000");
    }
  });

  it("no overspend when spent <= active: overspentCents=0, balanceCents=active-spent", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 5000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.overspentCents).toBe("0");
      expect(cat.reserveUsedCents).toBe("0");
      expect(cat.balanceCents).toBe("5000"); // 10000 - 5000
    }
  });

  it("overspent = max(0, spent - active - reserveUsed); reserveUsed = min(reserveAvail, overBy)", async () => {
    // spent=15000, active=10000, reserveAvail=3000 (1.5 EUR)
    // overBy = 15000 - 10000 = 5000
    // reserveUsed = min(3000, 5000) = 3000
    // overspent = 5000 - 3000 = 2000
    // balance = 10000 - 15000 + 3000 = -2000
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 15000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const reserves = new Map([[CAT_A, Money.of("30", "EUR")]]); // 30 EUR = 3000 cents
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits, reserves }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("3000");
      expect(cat.overspentCents).toBe("2000");
      expect(cat.balanceCents).toBe("-2000");
    }
  });

  it("RSCM-04: when spent > active + reserveAvail: reserveUsed=reserveAvail, overspent=remainder", async () => {
    // spent=20000, active=10000, reserveAvail=3000
    // overBy = 10000, reserveUsed = 3000 (fully consumed)
    // overspent = 10000 - 3000 = 7000
    // balance = 10000 - 20000 + 3000 = -7000
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 20000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const reserves = new Map([[CAT_A, Money.of("30", "EUR")]]); // 3000 cents
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits, reserves }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("3000");
      expect(cat.overspentCents).toBe("7000");
      expect(cat.balanceCents).toBe("-7000");
    }
  });

  it("reserve-used is capped at the REAL reserve-wallet money, not the over-allocated category reserve", async () => {
    // Groceries allocated €800 reserve but the reserve WALLET holds only €80.
    // You can't use money you don't have: reserveUsed must cap at €80 (8000c),
    // NOT the €800 (80000c) allocation.
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 100000n]]); // €1000 spent
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]); // €100 planned
    const reserves = new Map([[CAT_A, Money.of("800", "EUR")]]); // 80000c allocated
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend,
        limits,
        reserves,
        reserveWalletTotalCents: 8000n, // €80 actually in the reserve wallet
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("8000"); // capped at real €80
      // overspent = 100000 - 10000 - 8000 = 82000
      expect(cat.overspentCents).toBe("82000");
      // balance = 10000 - 100000 + 8000 = -82000
      expect(cat.balanceCents).toBe("-82000");
    }
  });

  it("real reserve pool is split across categories in proportion to their allocation", async () => {
    // Two categories allocated 60000c + 20000c (Σ 80000c) but the wallet holds
    // only 8000c. Each draws its proportional share: 6000c and 2000c (Σ 8000c).
    const CAT_B = "cat-bbbb-0000-0000-0000-000000000000";
    const cats = [makeCategory(CAT_A, 1), makeCategory(CAT_B, 2)];
    const spend = new Map([
      [CAT_A, 100000n],
      [CAT_B, 100000n],
    ]);
    const limits = new Map([
      [CAT_A, { planned: 10000n, cushion: 10000n }],
      [CAT_B, { planned: 10000n, cushion: 10000n }],
    ]);
    const reserves = new Map([
      [CAT_A, Money.of("600", "EUR")], // 60000c
      [CAT_B, Money.of("200", "EUR")], // 20000c
    ]);
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend,
        limits,
        reserves,
        reserveWalletTotalCents: 8000n, // €80 real, Σ allocation = €800
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const a = r.value.categories.find((c) => c.categoryId === CAT_A)!;
      const b = r.value.categories.find((c) => c.categoryId === CAT_B)!;
      expect(a.reserveUsedCents).toBe("6000"); // 60000 * 8000 / 80000
      expect(b.reserveUsedCents).toBe("2000"); // 20000 * 8000 / 80000
    }
  });

  it("reconciled budget (Σ category reserves ≤ wallet pool) is unaffected by the cap", async () => {
    // Allocation 3000c, wallet holds 10000c → no scaling; reserveUsed = min(overBy, 3000).
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 20000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const reserves = new Map([[CAT_A, Money.of("30", "EUR")]]); // 3000c
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend,
        limits,
        reserves,
        reserveWalletTotalCents: 10000n, // plenty of real reserve
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.categories[0].reserveUsedCents).toBe("3000");
    }
  });

  it("categories sorted by sortIndex ascending", async () => {
    const cat1 = makeCategory("cat-1111", 2);
    const cat2 = makeCategory("cat-2222", 1);
    const svc = getSpendingsSummary(makeDeps({ categories: [cat1, cat2] }));
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.categories[0].categoryId).toBe("cat-2222");
      expect(r.value.categories[1].categoryId).toBe("cat-1111");
    }
  });

  it("cushionModeEnabled flag propagated to DTO top level", async () => {
    const svc = getSpendingsSummary(
      makeDeps({ meta: makeMeta({ cushionModeEnabled: true }) }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.cushionModeEnabled).toBe(true);
    }
  });
});
