/**
 * get-overview-overspent.test.ts — RED (11-05 Task 1).
 *
 * Overspent + Reserves section service (D-10/D-06): range overspent total +
 * overspent-by-category bar (desc, >0 only) using the after-reserves formula
 * max(0, spent − active_limit − reserve_used) summed across the range months
 * (matches the Spendings grid), plus the reserves-by-category bar (mirrors
 * get-reserves-summary rows[].reserveCents). All in default_currency.
 *
 * spent + active_limit come from overview-repo (11-04). reserve_used per
 * category per month is engine-derived (reservePositions byMonth cells), the
 * SAME source the grid uses — so overspent matches bit-for-bit. No FX: every
 * term is already in the budget currency.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import {
  getOverviewOverspent,
  type GetOverviewOverspentDeps,
} from "@budget/budgeting/src/application/get-overview-overspent";

const overviewRepo: GetOverviewOverspentDeps["overviewRepo"] = {
  async monthlySpendByCategory() {
    return [
      // A overspends m1 + m3
      { category_id: "A", month: "2026-01", spent_cents: 25000n },
      { category_id: "A", month: "2026-02", spent_cents: 18000n },
      { category_id: "A", month: "2026-03", spent_cents: 24000n },
      // B never overspends
      { category_id: "B", month: "2026-01", spent_cents: 5000n },
      { category_id: "B", month: "2026-02", spent_cents: 6000n },
      // C archived after 2026-02 — m3 spend MUST be ignored (D-06)
      { category_id: "C", month: "2026-01", spent_cents: 30000n },
      { category_id: "C", month: "2026-02", spent_cents: 25000n },
      { category_id: "C", month: "2026-03", spent_cents: 99999n },
    ];
  },
  async monthlyPlannedByCategory() {
    return [
      { category_id: "A", month: "2026-01", planned_cents: 20000n },
      { category_id: "A", month: "2026-02", planned_cents: 20000n },
      { category_id: "A", month: "2026-03", planned_cents: 20000n },
      { category_id: "B", month: "2026-01", planned_cents: 20000n },
      { category_id: "B", month: "2026-02", planned_cents: 20000n },
      { category_id: "C", month: "2026-01", planned_cents: 20000n },
      { category_id: "C", month: "2026-02", planned_cents: 20000n },
      { category_id: "C", month: "2026-03", planned_cents: 20000n },
    ];
  },
  async categoryWindows() {
    return [
      {
        category_id: "A",
        name: "Food",
        created_month: "2025-06",
        archived_month: null,
      },
      {
        category_id: "B",
        name: "Rent",
        created_month: "2025-06",
        archived_month: null,
      },
      {
        category_id: "C",
        name: "Daycare",
        created_month: "2025-06",
        archived_month: "2026-02", // archived after Feb → no March
      },
    ];
  },
};

// Engine cells: A drew 20.00 reserve in March (covers part of its overage).
function reservePositions() {
  return async () =>
    ok({
      positions: new Map([
        [
          "A",
          {
            categoryId: "A",
            reserveCents: 0n,
            usedCents: 2000n,
            overspentCents: 7000n,
            reserveExcluded: false,
            byMonth: new Map([
              [
                "2026-03",
                {
                  usedCents: 2000n,
                  overspentCents: 2000n,
                  overageCents: 4000n,
                  leftCents: 0n,
                  endReserveCents: 0n,
                },
              ],
            ]),
          },
        ],
      ]),
      openMonth: "2026-06",
      internalCents: 30000n,
      userDefinedCents: 30000n,
      surplusCents: 0n,
      direction: "NONE" as const,
    });
}

function reservesSummary() {
  return async () =>
    ok({
      rows: [
        {
          categoryId: "A",
          name: "Food",
          colorKey: null,
          reserveCents: "30000",
          usedCents: "2000",
          usedThisMonthCents: "0",
          overspentCents: "7000",
        },
        {
          categoryId: "B",
          name: "Rent",
          colorKey: null,
          reserveCents: "0",
          usedCents: "0",
          usedThisMonthCents: "0",
          overspentCents: "0",
        },
      ],
      excludedRows: [],
      totals: {
        internalCents: "30000",
        userDefinedCents: "30000",
        surplusCents: "0",
        direction: "NONE" as const,
        usedCents: "2000",
        usedThisMonthCents: "0",
        disabled: false,
        budgetCurrency: "USD",
      },
    });
}

function deps(): GetOverviewOverspentDeps {
  return {
    overviewRepo,
    reservePositions:
      reservePositions() as GetOverviewOverspentDeps["reservePositions"],
    reservesSummary:
      reservesSummary() as GetOverviewOverspentDeps["reservesSummary"],
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "USD" };
      },
    },
  };
}

describe("getOverviewOverspent", () => {
  test("range overspent total + by-category (after-reserves, desc, >0 only) (D-10)", async () => {
    const dto = (
      await getOverviewOverspent(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();

    expect(dto.currency).toBe("USD");
    // A: m1 max(0,25000-20000-0)=5000; m2 0; m3 max(0,24000-20000-2000)=2000 → 7000
    // C: m1 max(0,30000-20000)=10000; m2 max(0,25000-20000)=5000; m3 EXCLUDED → 15000
    // B: never over → excluded
    expect(dto.overspent_by_category).toEqual([
      { category_id: "C", name: "Daycare", overspent_cents: "15000" },
      { category_id: "A", name: "Food", overspent_cents: "7000" },
    ]);
    expect(dto.overspent_total_cents).toBe("22000");
  });

  test("archived category contributes only its active months (D-06)", async () => {
    const dto = (
      await getOverviewOverspent(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    const c = dto.overspent_by_category.find((x) => x.category_id === "C")!;
    // 99999 March spend ignored → 10000 + 5000 only
    expect(c.overspent_cents).toBe("15000");
  });

  test("excludes the Investments category — over-investing is not overspending", async () => {
    const investRepo: GetOverviewOverspentDeps["overviewRepo"] = {
      async monthlySpendByCategory() {
        return [
          { category_id: "A", month: "2026-01", spent_cents: 25000n }, // Food over by 5000
          { category_id: "INV", month: "2026-01", spent_cents: 99999n }, // Investments "over" — MUST be excluded
        ];
      },
      async monthlyPlannedByCategory() {
        return [
          { category_id: "A", month: "2026-01", planned_cents: 20000n },
          { category_id: "INV", month: "2026-01", planned_cents: 10000n },
        ];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "Food",
            created_month: "2025-06",
            archived_month: null,
            is_investment: false,
          },
          {
            category_id: "INV",
            name: "Investments",
            created_month: "2025-06",
            archived_month: null,
            is_investment: true,
          },
        ];
      },
    };
    const dto = (
      await getOverviewOverspent({ ...deps(), overviewRepo: investRepo })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    // The Investments category is never "overspent" — excluded from the bar + total.
    expect(dto.overspent_by_category.map((c) => c.category_id)).not.toContain(
      "INV",
    );
    expect(dto.overspent_by_category).toEqual([
      { category_id: "A", name: "Food", overspent_cents: "5000" },
    ]);
    expect(dto.overspent_total_cents).toBe("5000");
  });

  test("reserves_by_category mirrors get-reserves-summary rows[].reserveCents", async () => {
    const dto = (
      await getOverviewOverspent(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    expect(dto.reserves_by_category).toEqual([
      { category_id: "A", name: "Food", reserve_cents: "30000" },
      { category_id: "B", name: "Rent", reserve_cents: "0" },
    ]);
  });
});
