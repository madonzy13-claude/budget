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
import type { SpendingsSummaryRepo } from "../../src/ports/spendings-summary-repo";
import type {
  ReservePosition,
  ReservePositionsResult,
} from "../../src/application/get-reserve-positions";
import { ok } from "@budget/shared-kernel";

/** Engine cell for a single (category, month). */
type Cell = {
  usedCents: bigint;
  overspentCents: bigint;
  endReserveCents?: bigint;
};

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
  /** Per-month SCD-2 limits keyed by 'YYYY-MM' — lets a test give May and June
   *  different budgets. Falls back to `limits` for unlisted months. */
  limitsByMonth?: Map<
    string,
    Map<string, { planned: bigint; cushion: bigint }>
  >;
  /**
   * Engine cells the replay orchestrator would return: cat → ('YYYY-MM' → cell).
   * reserveUsed/overspent for the viewed month come STRAIGHT from here — mirrors
   * production wiring (05-12). When absent the position has no cell → fallback.
   */
  cells?: Map<string, Map<string, Cell>>;
  /** Make the fake reservePositions error (exercise the err passthrough). */
  positionsError?: boolean;
  /** Injected clock so "is the viewed month the current month" is deterministic. */
  now?: () => Date;
  /** reserve_excluded flag for the fake position (drives the dash display). */
  reserveExcluded?: boolean;
}) {
  const categories = overrides.categories ?? [];
  const meta = overrides.meta !== undefined ? overrides.meta : makeMeta();
  const spend = overrides.spend ?? new Map();
  const limits = overrides.limits ?? new Map();

  const categoryRepo: Pick<CategoryRepo, "listForBudget"> = {
    listForBudget: async () => categories as any,
  };

  const limitsByMonth = overrides.limitsByMonth;

  const categoryLimitRepo: Pick<CategoryLimitRepo, "effectiveForMonth"> = {
    effectiveForMonth: async (_t: string, _b: string, monthStart: string) =>
      limitsByMonth?.get(monthStart.slice(0, 7)) ?? limits,
  };

  const transactionRepo: Pick<
    TransactionRepo,
    "spendByCategoryForMonth" | "spendByCategoryByMonth"
  > = {
    spendByCategoryForMonth: async () => spend,
    spendByCategoryByMonth: async () => new Map(),
  };

  const summaryRepo: SpendingsSummaryRepo = {
    getBudgetMeta: async () => meta,
  };

  // Build a ReservePositionsResult from the supplied engine cells.
  const cellsByCat = overrides.cells ?? new Map<string, Map<string, Cell>>();
  const reservePositions = async () => {
    if (overrides.positionsError) {
      return {
        isOk: () => false,
        isErr: () => true,
        error: new Error("boom"),
      } as any;
    }
    const positions = new Map<string, ReservePosition>();
    for (const [id, byMonthCells] of cellsByCat) {
      const byMonth = new Map(
        [...byMonthCells].map(([m, c]) => [
          m,
          {
            usedCents: c.usedCents,
            overspentCents: c.overspentCents,
            overageCents: c.usedCents + c.overspentCents,
            leftCents: 0n,
            endReserveCents: c.endReserveCents ?? 0n,
          },
        ]),
      );
      let used = 0n;
      let overspent = 0n;
      for (const c of byMonthCells.values()) {
        used += c.usedCents;
        overspent += c.overspentCents;
      }
      positions.set(id, {
        categoryId: id,
        reserveCents: 0n,
        usedCents: used,
        overspentCents: overspent,
        reserveExcluded: overrides.reserveExcluded ?? false,
        byMonth,
      });
    }
    const result: ReservePositionsResult = {
      positions,
      internalCents: 0n,
      userDefinedCents: 0n,
      surplusCents: 0n,
      direction: "NONE",
    };
    return ok(result);
  };

  return {
    categoryRepo: categoryRepo as CategoryRepo,
    categoryLimitRepo: categoryLimitRepo as CategoryLimitRepo,
    transactionRepo: transactionRepo as TransactionRepo,
    summaryRepo,
    reservePositions,
    ...(overrides.now ? { now: overrides.now } : {}),
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

  it("reserveUsed + overspent come straight from the engine cell for the month", async () => {
    // cell: used 3000, overspent 2000 → balance = active − spent + used.
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 15000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const cells = new Map([
      [CAT_A, new Map([[MONTH, { usedCents: 3000n, overspentCents: 2000n }]])],
    ]);
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits, cells }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("3000");
      expect(cat.overspentCents).toBe("2000");
      expect(cat.balanceCents).toBe("-2000"); // 10000 − 15000 + 3000
    }
  });

  it("reserve fully consumed for the month → the rest is overspent (from the cell)", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 20000n]]);
    const limits = new Map([[CAT_A, { planned: 10000n, cushion: 10000n }]]);
    const cells = new Map([
      [CAT_A, new Map([[MONTH, { usedCents: 3000n, overspentCents: 7000n }]])],
    ]);
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits, cells }),
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

  it("user scenario: cell used €710, overspent €100", async () => {
    const cats = [makeCategory(CAT_A, 1)];
    const spend = new Map([[CAT_A, 83000n]]);
    const limits = new Map([[CAT_A, { planned: 2000n, cushion: 2000n }]]);
    const cells = new Map([
      [
        CAT_A,
        new Map([[MONTH, { usedCents: 71000n, overspentCents: 10000n }]]),
      ],
    ]);
    const svc = getSpendingsSummary(
      makeDeps({ categories: cats, spend, limits, cells }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("71000"); // €710
      expect(cat.overspentCents).toBe("10000"); // €100
    }
  });

  it("reads only the VIEWED month's cell (older month gets its own engine value)", async () => {
    // Engine already split the shared reserve across months; the grid just reads
    // the cell for the viewed month. May cell: used €100, overspent €200.
    const cats = [makeCategory(CAT_A, 1)];
    const svc = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend: new Map([[CAT_A, 30000n]]), // €300 spent in May
        limitsByMonth: new Map([
          ["2026-05", new Map([[CAT_A, { planned: 0n, cushion: 0n }]])],
        ]),
        cells: new Map([
          [
            CAT_A,
            new Map([
              ["2026-06", { usedCents: 30000n, overspentCents: 0n }],
              ["2026-05", { usedCents: 10000n, overspentCents: 20000n }],
            ]),
          ],
        ]),
        now: () => new Date("2026-06-15T00:00:00Z"),
      }),
    );
    const r = await svc({
      tenantId: TENANT,
      budgetId: BUDGET,
      month: "2026-05",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const cat = r.value.categories[0];
      expect(cat.reserveUsedCents).toBe("10000"); // only the €100 cell
      expect(cat.overspentCents).toBe("20000"); // the other €200 is overspent
    }
  });

  it("surfaces a reservePositions error as err()", async () => {
    const svc = getSpendingsSummary(
      makeDeps({ categories: [makeCategory(CAT_A, 1)], positionsError: true }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isErr()).toBe(true);
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

  it("reserveAvailableCents = used + free reserve at month's end; used clamped ≤ available", async () => {
    const cats = [makeCategory(CAT_A, 0)];
    // Viewed month May: used 28, free reserve at May end 0 → available 28 ("28/28").
    const svcCapped = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend: new Map([[CAT_A, 5000n]]),
        limitsByMonth: new Map([
          ["2026-05", new Map([[CAT_A, { planned: 0n, cushion: 0n }]])],
        ]),
        cells: new Map([
          [
            CAT_A,
            new Map([
              [
                "2026-05",
                {
                  usedCents: 2800n,
                  overspentCents: 2200n,
                  endReserveCents: 0n,
                },
              ],
            ]),
          ],
        ]),
      }),
    );
    const a = await svcCapped({
      tenantId: TENANT,
      budgetId: BUDGET,
      month: "2026-05",
    });
    expect(a.isOk()).toBe(true);
    if (a.isOk()) {
      const c = a.value.categories[0];
      expect(c.reserveUsedCents).toBe("2800");
      expect(c.reserveAvailableCents).toBe("2800"); // 28 used + 0 free
    }

    // Viewed month with free reserve left: used 61, free at end 19 → available 80.
    const svcFree = getSpendingsSummary(
      makeDeps({
        categories: cats,
        spend: new Map([[CAT_A, 6100n]]),
        limitsByMonth: new Map([
          ["2026-06", new Map([[CAT_A, { planned: 0n, cushion: 0n }]])],
        ]),
        cells: new Map([
          [
            CAT_A,
            new Map([
              [
                "2026-06",
                {
                  usedCents: 6100n,
                  overspentCents: 0n,
                  endReserveCents: 1900n,
                },
              ],
            ]),
          ],
        ]),
      }),
    );
    const b = await svcFree({
      tenantId: TENANT,
      budgetId: BUDGET,
      month: "2026-06",
    });
    expect(b.isOk()).toBe(true);
    if (b.isOk()) {
      const c = b.value.categories[0];
      expect(c.reserveUsedCents).toBe("6100");
      expect(c.reserveAvailableCents).toBe("8000"); // 61 used + 19 free
    }
  });

  it("passes reserveExcluded through to the DTO (drives the dash display)", async () => {
    const svc = getSpendingsSummary(
      makeDeps({
        categories: [makeCategory(CAT_A, 0)],
        reserveExcluded: true,
        cells: new Map([
          [CAT_A, new Map([[MONTH, { usedCents: 0n, overspentCents: 0n }]])],
        ]),
      }),
    );
    const r = await svc({ tenantId: TENANT, budgetId: BUDGET, month: MONTH });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.categories[0].reserveExcluded).toBe(true);
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

  it("computes reserves at the CURRENT month (no viewed-month openMonth override)", async () => {
    // Reserve is a single per-category pool; a past month's cell must reflect the
    // reserve state as of NOW, so the service must NOT pass the viewed month as the
    // reserve open month (that would truncate later spend but still sweep later
    // reserve top-ups back onto the viewed month). Lock it: capture the arg.
    const seen: Array<{ month?: string }> = [];
    const positions = new Map<string, ReservePosition>([
      [
        CAT_A,
        {
          categoryId: CAT_A,
          reserveCents: 0n,
          usedCents: 10000n,
          overspentCents: 20000n,
          reserveExcluded: false,
          byMonth: new Map([
            [
              "2026-05",
              {
                usedCents: 10000n,
                overspentCents: 20000n,
                overageCents: 30000n,
                leftCents: 0n,
                endReserveCents: 0n,
              },
            ],
          ]),
        },
      ],
    ]);
    const result: ReservePositionsResult = {
      positions,
      internalCents: 0n,
      userDefinedCents: 0n,
      surplusCents: 0n,
      direction: "NONE",
    };
    const deps = makeDeps({
      categories: [makeCategory(CAT_A, 1)],
      spend: new Map([[CAT_A, 30000n]]),
      limitsByMonth: new Map([
        ["2026-05", new Map([[CAT_A, { planned: 0n, cushion: 0n }]])],
      ]),
    });
    // Swap in a spying reservePositions that records the month it was called with.
    deps.reservePositions = (async (input: {
      tenantId: string;
      budgetId: string;
      month?: string;
    }) => {
      seen.push({ month: input.month });
      return ok(result);
    }) as typeof deps.reservePositions;

    // Viewing a PAST month (May) while "now" is later.
    const r = await getSpendingsSummary(deps)({
      tenantId: TENANT,
      budgetId: BUDGET,
      month: "2026-05",
    });
    expect(r.isOk()).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0].month).toBeUndefined(); // current-month pool, NOT the viewed month
    if (r.isOk()) {
      // The viewed month's slice is still selected from byMonth.
      expect(r.value.categories[0].reserveUsedCents).toBe("10000");
      expect(r.value.categories[0].overspentCents).toBe("20000");
    }
  });
});
