/**
 * get-overview-planned.test.ts — RED (11-04 Task 1).
 *
 * Planned section service: multi-month Planned-vs-Real timeline (D-12), adaptive
 * monthly/daily bucket (D-20), planned-avg-vs-real-avg over ONLY the months a
 * category was active (D-13), and the two current-config recurring charts (D-14).
 * Timeline planned/real are already default_ccy (limits in budget ccy; ledger
 * stores amount_converted_cents) — no FX on that path; recurring amounts are FX'd.
 */
import { describe, test, expect } from "bun:test";
import {
  getOverviewPlanned,
  type GetOverviewPlannedDeps,
} from "@budget/budgeting/src/application/get-overview-planned";

function fx() {
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

const repo: GetOverviewPlannedDeps["repo"] = {
  async monthlyPlannedByCategory() {
    return [
      { category_id: "X", month: "2026-01", planned_cents: 20000n },
      { category_id: "X", month: "2026-02", planned_cents: 20000n },
      { category_id: "X", month: "2026-03", planned_cents: 15000n }, // cushion month
      { category_id: "Y", month: "2026-02", planned_cents: 30000n },
      { category_id: "Y", month: "2026-03", planned_cents: 30000n },
    ];
  },
  async monthlySpendByCategory() {
    return [
      { category_id: "X", month: "2026-01", spent_cents: 18000n },
      { category_id: "X", month: "2026-02", spent_cents: 21000n },
      { category_id: "X", month: "2026-03", spent_cents: 14000n },
      { category_id: "Y", month: "2026-02", spent_cents: 10000n },
      { category_id: "Y", month: "2026-03", spent_cents: 20000n },
    ];
  },
  async categoryWindows() {
    return [
      {
        category_id: "X",
        name: "Groceries",
        created_month: "2025-06",
        archived_month: null,
      },
      {
        category_id: "Y",
        name: "Daycare",
        created_month: "2026-02",
        archived_month: null,
      },
    ];
  },
  async dailySpend() {
    return [
      { day: "2026-06-01", spent_cents: 5000n },
      { day: "2026-06-02", spent_cents: 3000n },
    ];
  },
  async activeRecurringRules() {
    return [
      {
        category_id: "A",
        name: "Netflix",
        amount_cents: 10000n,
        currency: "USD",
        cadence: "MONTHLY",
        yearly_month: null,
      },
      {
        category_id: "B",
        name: "Insurance",
        amount_cents: 120000n,
        currency: "USD",
        cadence: "YEARLY",
        yearly_month: 6,
      },
    ];
  },
};

function deps(): GetOverviewPlannedDeps {
  return {
    repo,
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "USD" };
      },
    },
    fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
  };
}

describe("getOverviewPlanned", () => {
  test("monthly timeline: budget-wide planned + real per month (D-12)", async () => {
    const r = await getOverviewPlanned(deps())({
      tenantId: "b1",
      budgetId: "b1",
      from: "2026-01-01",
      to: "2026-03-31",
    });
    const dto = r._unsafeUnwrap();
    expect(dto.bucket).toBe("monthly");
    expect(dto.currency).toBe("USD");
    expect(dto.timeline.map((p) => p.label)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // planned = ΣX + ΣY per month: 01=20000, 02=20000+30000=50000, 03=15000+30000=45000
    expect(dto.timeline.map((p) => p.planned_cents)).toEqual([
      "20000",
      "50000",
      "45000",
    ]);
    // real = 01=18000, 02=21000+10000=31000, 03=14000+20000=34000
    expect(dto.timeline.map((p) => p.real_cents)).toEqual([
      "18000",
      "31000",
      "34000",
    ]);
  });

  test("per-category filter restricts the timeline to that category", async () => {
    const dto = (
      await getOverviewPlanned(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
        categoryId: "X",
      })
    )._unsafeUnwrap();
    expect(dto.timeline.map((p) => p.planned_cents)).toEqual([
      "20000",
      "20000",
      "15000",
    ]);
    expect(dto.timeline.map((p) => p.real_cents)).toEqual([
      "18000",
      "21000",
      "14000",
    ]);
  });

  test("planned-avg averages over ONLY active months (D-13)", async () => {
    const dto = (
      await getOverviewPlanned(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    const y = dto.plannedAvgVsReal.find((c) => c.category_id === "Y")!;
    // Y created 2026-02 → active 2 of 3 months: planned (30000+30000)/2, real (10000+20000)/2
    expect(y.planned_avg_cents).toBe("30000");
    expect(y.real_avg_cents).toBe("15000");
    const x = dto.plannedAvgVsReal.find((c) => c.category_id === "X")!;
    // X active all 3: planned (20000+20000+15000)/3=18333, real (18000+21000+14000)/3=17667
    expect(x.planned_avg_cents).toBe("18333");
    expect(x.real_avg_cents).toBe("17667");
  });

  test("adaptive bucket: a within-one-month range is daily (D-20)", async () => {
    const dto = (
      await getOverviewPlanned(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-06-01",
        to: "2026-06-30",
      })
    )._unsafeUnwrap();
    expect(dto.bucket).toBe("daily");
    // cumulative real per day
    expect(dto.timeline.map((p) => p.real_cents)).toEqual(["5000", "8000"]);
  });

  test("recurring per-month distribution + per-category monthly (D-14, all cadences)", async () => {
    const dto = (
      await getOverviewPlanned(deps())({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    // per-month: MONTHLY 10000 in all 12; YEARLY 120000 full in month 6 only
    const m = new Map(
      dto.recurringPerMonth.map((x) => [x.month, x.planned_cents]),
    );
    expect(m.get(1)).toBe("10000");
    expect(m.get(6)).toBe("130000"); // 10000 monthly + 120000 yearly
    // per-category: monthly-normalized (YEARLY ÷12)
    const perCat = new Map(
      dto.recurringPerCategory.map((x) => [x.category_id, x.planned_cents]),
    );
    expect(perCat.get("A")).toBe("10000");
    expect(perCat.get("B")).toBe("10000"); // 120000/12
  });
});
