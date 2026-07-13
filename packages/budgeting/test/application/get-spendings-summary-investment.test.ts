/**
 * get-spendings-summary-investment.test.ts — the smart Investments category (r33).
 *
 * SMART limit = monthly income (FX→budget ccy) − Σ planned of every OTHER active
 * category, clamped ≥ 0. MANUAL uses the stored limit. cushion is always 0. The
 * DTO exposes isInvestment so the grid can render the green "overinvested" row.
 */
import { describe, it, expect } from "bun:test";
import { getSpendingsSummary } from "../../src/application/get-spendings-summary";
import type { CategoryLimitRepo } from "../../src/ports/category-limit-repo";
import type { TransactionRepo } from "../../src/ports/transaction-repo";
import type { SpendingsSummaryRepo } from "../../src/ports/spendings-summary-repo";
import type { ReservePositionsResult } from "../../src/application/get-reserve-positions";
import { ok } from "@budget/shared-kernel";

const TENANT = "tenant-1";
const BUDGET = "budget-1";
const MONTH = "2026-05";
const CAT_A = "cat-aaaa";
const CAT_B = "cat-bbbb";
const CAT_INV = "cat-iiii";

function cat(
  id: string,
  sortIndex: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    tenantId: TENANT,
    name: `Cat-${id}`,
    parentId: null,
    archivedAt: null,
    createdAt: new Date(),
    actorUserId: "u",
    sortIndex,
    colorKey: null,
    isInvestment: false,
    investmentLimitMode: null,
    ...extra,
  };
}

function makeDeps(opts: {
  categories: any[];
  limits: Map<string, { planned: bigint; cushion: bigint }>;
  spend?: Map<string, bigint>;
  incomes?: {
    amount: string;
    currency: string;
    cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  }[];
  currency?: string;
  rate?: string;
  cushionMode?: boolean;
  /** Inject an engine cell (overageCents) per category for the viewed month —
   *  mimics the reserve engine computing overage from the STORED limit. */
  engineOverage?: Map<string, bigint>;
}) {
  const categoryRepo = { listForBudget: async () => opts.categories };
  const categoryLimitRepo: Pick<CategoryLimitRepo, "effectiveForMonth"> = {
    effectiveForMonth: async () =>
      new Map(
        [...opts.limits].map(([k, v]) => [
          k,
          { ...v, needs: null, wants: null },
        ]),
      ),
  };
  const transactionRepo: Pick<
    TransactionRepo,
    "spendByCategoryForMonth" | "spendByCategoryByMonth"
  > = {
    spendByCategoryForMonth: async () => opts.spend ?? new Map(),
    spendByCategoryByMonth: async () => new Map(),
  };
  const summaryRepo: SpendingsSummaryRepo = {
    getBudgetMeta: async () => ({
      cushionModeEnabled: opts.cushionMode ?? false,
      currency: opts.currency ?? "USD",
      timezone: "UTC",
    }),
  };
  const positions = new Map<string, any>();
  for (const [catId, overage] of opts.engineOverage ?? new Map()) {
    positions.set(catId, {
      categoryId: catId,
      reserveCents: 0n,
      usedCents: 0n,
      overspentCents: overage,
      reserveExcluded: true,
      byMonth: new Map([
        [
          MONTH,
          {
            usedCents: 0n,
            overspentCents: overage,
            overageCents: overage,
            leftCents: 0n,
            endReserveCents: 0n,
          },
        ],
      ]),
    });
  }
  const reservePositions = async () =>
    ok({
      positions,
      internalCents: 0n,
      userDefinedCents: 0n,
      surplusCents: 0n,
      direction: "NONE",
    } as ReservePositionsResult);
  const incomeRepo = {
    listActive: async () =>
      (opts.incomes ?? []).map((i, n) => ({
        id: `inc-${n}`,
        tenantId: TENANT,
        name: `Income ${n}`,
        amount: i.amount,
        currency: i.currency,
        cadence: i.cadence,
        cadenceAnchor: null,
        weeklyDow: null,
        yearlyMonth: null,
        active: true,
        createdAt: new Date(),
        actorUserId: "u",
      })),
  };
  const fxProvider = {
    rateAsOf: async () => ({
      rate: opts.rate ?? "1",
      provider: "fake",
      isStale: false,
    }),
  };
  return {
    categoryRepo: categoryRepo as any,
    categoryLimitRepo: categoryLimitRepo as any,
    transactionRepo: transactionRepo as any,
    summaryRepo,
    reservePositions,
    incomeRepo: incomeRepo as any,
    fxProvider: fxProvider as any,
    now: () => new Date("2026-05-15T00:00:00Z"),
  };
}

function findCat(cats: any[], id: string) {
  return cats.find((c) => c.categoryId === id)!;
}

describe("getSpendingsSummary — Investments category (r33)", () => {
  const base = [
    cat(CAT_A, 1),
    cat(CAT_B, 2),
    cat(CAT_INV, 0, { isInvestment: true, investmentLimitMode: "smart" }),
  ];
  const limits = new Map([
    [CAT_A, { planned: 300000n, cushion: 0n }],
    [CAT_B, { planned: 100000n, cushion: 0n }],
    [CAT_INV, { planned: 999999n, cushion: 42n }], // ignored in smart mode
  ]);

  it("smart mode: planned = monthly income − Σ other planned, cushion forced 0", async () => {
    const svc = getSpendingsSummary(
      makeDeps({
        categories: base,
        limits,
        currency: "USD",
        incomes: [{ amount: "6000", currency: "USD", cadence: "MONTHLY" }],
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    const inv = findCat((r as any).value.categories, CAT_INV);
    // 600000 − (300000 + 100000) = 200000
    expect(inv.plannedCents).toBe("200000");
    expect(inv.cushionCents).toBe("0");
    expect(inv.isInvestment).toBe(true);
  });

  it("smart mode: clamps to 0 when other planned exceeds income", async () => {
    const svc = getSpendingsSummary(
      makeDeps({
        categories: base,
        limits,
        currency: "USD",
        incomes: [{ amount: "300", currency: "USD", cadence: "MONTHLY" }], // 30000
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    const inv = findCat((r as any).value.categories, CAT_INV);
    expect(inv.plannedCents).toBe("0");
  });

  it("manual mode: planned = stored limit, income ignored, cushion 0", async () => {
    const manual = [
      cat(CAT_A, 1),
      cat(CAT_INV, 0, { isInvestment: true, investmentLimitMode: "manual" }),
    ];
    const svc = getSpendingsSummary(
      makeDeps({
        categories: manual,
        limits: new Map([
          [CAT_A, { planned: 300000n, cushion: 0n }],
          [CAT_INV, { planned: 50000n, cushion: 42n }],
        ]),
        currency: "USD",
        incomes: [{ amount: "9000", currency: "USD", cadence: "MONTHLY" }],
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    const inv = findCat((r as any).value.categories, CAT_INV);
    expect(inv.plannedCents).toBe("50000");
    expect(inv.cushionCents).toBe("0");
    expect(inv.isInvestment).toBe(true);
  });

  it("smart mode: overinvested = spent − smart limit, NOT the engine's stored-limit overage", async () => {
    // Real-world: the smart category has no stored limit, so the reserve engine
    // computes overage = spent − 0 = full spend. The summary must instead use the
    // computed smart limit (income 600000 − others 400000 = 200000).
    const svc = getSpendingsSummary(
      makeDeps({
        categories: base,
        limits,
        currency: "USD",
        incomes: [{ amount: "6000", currency: "USD", cadence: "MONTHLY" }],
        spend: new Map([[CAT_INV, 250000n]]), // invested 2500
        engineOverage: new Map([[CAT_INV, 250000n]]), // engine says overage=2500 (limit 0)
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    const inv = findCat((r as any).value.categories, CAT_INV);
    expect(inv.plannedCents).toBe("200000");
    // 250000 spent − 200000 smart limit = 50000 overinvested (NOT 250000).
    expect(inv.overspentCents).toBe("50000");
  });

  it("cushion mode ON: Investments limit is 0 (no cushion → don't invest on the tighter budget)", async () => {
    const svc = getSpendingsSummary(
      makeDeps({
        categories: base,
        limits,
        currency: "USD",
        cushionMode: true, // budget in cushion display mode
        incomes: [{ amount: "6000", currency: "USD", cadence: "MONTHLY" }],
        spend: new Map([[CAT_INV, 250000n]]),
        engineOverage: new Map([[CAT_INV, 250000n]]),
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    const inv = findCat((r as any).value.categories, CAT_INV);
    // cushion is 0 → the active (displayed) limit is 0 in cushion mode.
    expect(inv.cushionCents).toBe("0");
    expect(inv.activeBudgetCents).toBe("0");
    // overspent/overinvested is spent against the 0 cushion limit.
    expect(inv.overspentCents).toBe("250000");
  });

  it("normal categories keep isInvestment=false", async () => {
    const svc = getSpendingsSummary(
      makeDeps({ categories: base, limits, currency: "USD" }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    const a = findCat((r as any).value.categories, CAT_A);
    expect(a.isInvestment).toBe(false);
  });
});
