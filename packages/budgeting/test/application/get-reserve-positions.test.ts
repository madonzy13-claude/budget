/**
 * get-reserve-positions.test.ts — TDD for the shared reserve-position service.
 *
 * Computes, per category, the cumulative reserve state used by the reserves
 * tab, the spendings grid, and the RESERVE_TOPUP reconciliation:
 *   expectedReserveCents = allocation − Σ months(min(overspend, realCap))
 * where realCap is the category's proportional share of the real reserve
 * wallet pool. Underspend does not accrue reserve in v1 (manual adjustments
 * remain the only inflow).
 */
import { describe, it, expect } from "bun:test";
import { getReservePositions } from "../../src/application/get-reserve-positions";
import type { ReserveBalanceRepo } from "../../src/ports/reserve-balance-repo";
import type { CategoryLimitRepo } from "../../src/ports/category-limit-repo";
import type { TransactionRepo } from "../../src/ports/transaction-repo";
import type { ReservesSummaryRepo } from "../../src/ports/reserves-summary-repo";
import type { SpendingsSummaryRepo } from "../../src/ports/spendings-summary-repo";
import { Money } from "@budget/shared-kernel";

const TENANT = "t1";
const BUDGET = "b1";
const GROC = "cat-groceries";
const HOUSING = "cat-housing";

function makeDeps(o: {
  allocations?: Map<string, Money>;
  limits?: Map<string, { planned: bigint; cushion: bigint }>;
  spendByMonth?: Map<string, Map<string, bigint>>;
  walletPoolCents?: bigint;
  cushionMode?: boolean;
}) {
  const reserveBalanceRepo = {
    getForBudget: async () => o.allocations ?? new Map(),
  } as unknown as ReserveBalanceRepo;
  const categoryLimitRepo = {
    effectiveForMonth: async () => o.limits ?? new Map(),
  } as unknown as CategoryLimitRepo;
  const transactionRepo = {
    spendByCategoryByMonth: async () => o.spendByMonth ?? new Map(),
  } as unknown as TransactionRepo;
  const reservesSummaryRepo = {
    sumReserveWalletAmounts: async () => o.walletPoolCents ?? 10n ** 18n,
  } as unknown as ReservesSummaryRepo;
  const summaryRepo = {
    getBudgetMeta: async () => ({
      cushionModeEnabled: o.cushionMode ?? false,
      currency: "EUR",
      timezone: "UTC",
    }),
  } as unknown as SpendingsSummaryRepo;
  return {
    reserveBalanceRepo,
    categoryLimitRepo,
    transactionRepo,
    reservesSummaryRepo,
    summaryRepo,
  };
}

const run = (deps: ReturnType<typeof makeDeps>) =>
  getReservePositions(deps)({
    tenantId: TENANT,
    budgetId: BUDGET,
    month: "2026-06",
  });

describe("getReservePositions", () => {
  it("no overspend → expected reserve equals the allocation", async () => {
    const r = await run(
      makeDeps({
        allocations: new Map([[GROC, Money.of("100", "EUR")]]),
        limits: new Map([[GROC, { planned: 30000n, cushion: 30000n }]]),
        spendByMonth: new Map([[GROC, new Map([["2026-06", 20000n]])]]), // under
        walletPoolCents: 100000n,
      }),
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const p = r.value.get(GROC)!;
      expect(p.allocationCents).toBe(10000n);
      expect(p.cumulativeUsageCents).toBe(0n);
      expect(p.expectedReserveCents).toBe(10000n);
    }
  });

  it("overspend depletes the reserve, capped at the real wallet share (user scenario)", async () => {
    // Groceries: allocation €80,000, planned €300, spent €792 (overspend €492),
    // real wallet €80. Cap = €80 → usage €80 → expected €79,920.
    const r = await run(
      makeDeps({
        allocations: new Map([[GROC, Money.of("80000", "EUR")]]),
        limits: new Map([[GROC, { planned: 30000n, cushion: 30000n }]]),
        spendByMonth: new Map([[GROC, new Map([["2026-06", 79200n]])]]),
        walletPoolCents: 8000n, // €80 real
      }),
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const p = r.value.get(GROC)!;
      expect(p.cumulativeUsageCents).toBe(8000n);
      expect(p.expectedReserveCents).toBe(7_992_000n); // €79,920
    }
  });

  it("sums usage across months (old-month spend counts)", async () => {
    // plenty of real reserve so cap doesn't bind; overspend in two months.
    const r = await run(
      makeDeps({
        allocations: new Map([[GROC, Money.of("1000", "EUR")]]), // 100000c
        limits: new Map([[GROC, { planned: 10000n, cushion: 10000n }]]),
        spendByMonth: new Map([
          [
            GROC,
            new Map([
              ["2026-05", 13000n], // over by 3000
              ["2026-06", 12000n], // over by 2000
            ]),
          ],
        ]),
        walletPoolCents: 10n ** 12n,
      }),
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const p = r.value.get(GROC)!;
      expect(p.cumulativeUsageCents).toBe(5000n); // 3000 + 2000
      expect(p.expectedReserveCents).toBe(95000n); // 100000 - 5000
    }
  });

  it("splits the real reserve pool proportionally across categories", async () => {
    // Σ alloc = 80000c; wallet 8000c. Groceries 60000c → cap 6000; Housing
    // 20000c → cap 2000. Both overspend hugely → usage 6000 / 2000.
    const r = await run(
      makeDeps({
        allocations: new Map([
          [GROC, Money.of("600", "EUR")],
          [HOUSING, Money.of("200", "EUR")],
        ]),
        limits: new Map([
          [GROC, { planned: 1000n, cushion: 1000n }],
          [HOUSING, { planned: 1000n, cushion: 1000n }],
        ]),
        spendByMonth: new Map([
          [GROC, new Map([["2026-06", 500000n]])],
          [HOUSING, new Map([["2026-06", 500000n]])],
        ]),
        walletPoolCents: 8000n,
      }),
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.get(GROC)!.cumulativeUsageCents).toBe(6000n);
      expect(r.value.get(HOUSING)!.cumulativeUsageCents).toBe(2000n);
    }
  });
});
