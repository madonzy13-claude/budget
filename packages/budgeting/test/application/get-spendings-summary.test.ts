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
}) {
  const categories = overrides.categories ?? [];
  const meta = overrides.meta !== undefined ? overrides.meta : makeMeta();
  const spend = overrides.spend ?? new Map();
  const limits = overrides.limits ?? new Map();
  const reserves = overrides.reserves ?? new Map();

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

  return {
    categoryRepo: categoryRepo as CategoryRepo,
    categoryLimitRepo: categoryLimitRepo as CategoryLimitRepo,
    transactionRepo: transactionRepo as TransactionRepo,
    reserveBalanceRepo: reserveBalanceRepo as ReserveBalanceRepo,
    summaryRepo,
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
