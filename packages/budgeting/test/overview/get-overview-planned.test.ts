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
import { ok } from "@budget/shared-kernel";
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
        is_investment: false,
      },
      {
        category_id: "Y",
        name: "Daycare",
        created_month: "2026-02",
        archived_month: null,
        is_investment: false,
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
    // cumulative real per spend day, plus the window END anchor carrying the
    // final cumulative so the chart spans the whole range (from == first spend
    // day here, so no leading anchor is added).
    expect(dto.timeline.map((p) => p.label)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-30",
    ]);
    expect(dto.timeline.map((p) => p.real_cents)).toEqual([
      "5000",
      "8000",
      "8000",
    ]);
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

  test("the Investments category is IN plannedAvgVsReal, at its SMART limit", async () => {
    // Minimal repo: one normal category N (planned 30000) + a smart investment
    // category I (no planned/spend). Income 100000/mo → I planned = 100000−30000.
    const smartRepo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "N", month: "2026-01", planned_cents: 30000n }];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
          {
            category_id: "I",
            name: "Investments",
            created_month: "2026-01",
            archived_month: null,
            is_investment: true,
            investment_limit_mode: "smart",
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const smartDeps: GetOverviewPlannedDeps = {
      repo: smartRepo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      incomeRepo: {
        async listActive() {
          return [{ amount: "1000.00", currency: "USD", cadence: "MONTHLY" }];
        },
      },
    };
    const dto = (
      await getOverviewPlanned(smartDeps)({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-01-31",
      })
    )._unsafeUnwrap();
    const n = dto.plannedAvgVsReal.find((c) => c.category_id === "N")!;
    expect(n.planned_avg_cents).toBe("30000");
    // It belongs to both by-category charts now (260803 user request), and on
    // SMART it carries no stored limit — its plan is income minus everything
    // else planned, the same figure the Spendings grid shows. Without resolving
    // it the category would arrive with a plan of ZERO and read as pure
    // overspend.
    const i = dto.plannedAvgVsReal.find((c) => c.category_id === "I")!;
    expect(i).toBeTruthy();
    expect(i.planned_avg_cents).toBe("70000"); // 100000 income − 30000 planned
  });

  test("timeline COUNTS the investment category's planned + spend", async () => {
    // Normal N (planned 30000, spend 20000) + investment V on MANUAL (planned
    // 50000, spend 40000), Jan. A 3-month range → monthly timeline. Both count:
    // the line is the household's whole outgoing (260803 user request).
    const tlRepo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "N", month: "2026-01", planned_cents: 30000n },
          { category_id: "V", month: "2026-01", planned_cents: 50000n },
        ];
      },
      async monthlySpendByCategory() {
        return [
          { category_id: "N", month: "2026-01", spent_cents: 20000n },
          { category_id: "V", month: "2026-01", spent_cents: 40000n },
        ];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
          {
            category_id: "V",
            name: "Investments",
            created_month: "2026-01",
            archived_month: null,
            is_investment: true,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const tlDeps: GetOverviewPlannedDeps = {
      repo: tlRepo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      incomeRepo: {
        async listActive() {
          return [{ amount: "1000.00", currency: "USD", cadence: "MONTHLY" }];
        },
      },
    };
    const dto = (
      await getOverviewPlanned(tlDeps)({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    expect(dto.bucket).toBe("monthly");
    const jan = dto.timeline.find((t) => t.label === "2026-01")!;
    expect(jan.planned_cents).toBe("80000"); // 30000 + V's 50000
    expect(jan.real_cents).toBe("60000"); // 20000 + V's 40000
    // …and the avg-by-category chart lists it too.
    expect(dto.plannedAvgVsReal.some((c) => c.category_id === "V")).toBe(true);
  });

  test("daily bucket, NO spend but a planned limit → planned-only line (real=0), not empty", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "N", month: "2026-01", planned_cents: 30000n }];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return []; // no confirmed spend in range
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-01-15", // same month → daily bucket
      })
    )._unsafeUnwrap();
    expect(dto.bucket).toBe("daily");
    // Two endpoints draw the flat planned line; real is 0 everywhere.
    expect(dto.timeline.map((p) => p.label)).toEqual([
      "2026-01-01",
      "2026-01-15",
    ]);
    expect(dto.timeline.every((p) => p.real_cents === "0")).toBe(true);
    expect(dto.timeline[0]!.planned_cents).toBe("30000");
  });

  test("daily bucket anchors the series at `from`/`to` (1M starts at the 1st, not the first spend day)", async () => {
    const spendRepo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "N", month: "2026-07", planned_cents: 30000n }];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        // First confirmed spend only mid-month.
        return [
          { day: "2026-07-12", spent_cents: 4000n },
          { day: "2026-07-14", spent_cents: 1000n },
        ];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo: spendRepo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-07-01",
        to: "2026-07-22",
      })
    )._unsafeUnwrap();
    expect(dto.bucket).toBe("daily");
    // Series starts at the window start (the 1st) at real=0 — NOT the first
    // spend day (the reported bug: "1M shows from 12 Jul").
    expect(dto.timeline[0]!.label).toBe("2026-07-01");
    expect(dto.timeline[0]!.real_cents).toBe("0");
    // Cumulative real is preserved on the spend days.
    expect(dto.timeline.find((p) => p.label === "2026-07-12")!.real_cents).toBe(
      "4000",
    );
    expect(dto.timeline.find((p) => p.label === "2026-07-14")!.real_cents).toBe(
      "5000",
    );
    // …and spans to the window end (today) at the final cumulative.
    const last = dto.timeline[dto.timeline.length - 1]!;
    expect(last.label).toBe("2026-07-22");
    expect(last.real_cents).toBe("5000");
  });

  test("multi-month daily bucket restarts every month at zero", async () => {
    // 260801 (user decision): each month is its own cycle. The plan is that
    // month's own limit and the spend line restarts at 0 on the 1st, so the
    // chart reads as a row of monthly burn-ups instead of one ever-climbing
    // total that could never be compared against a single month's limit.
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          {
            category_id: "N",
            month: "2026-06",
            planned_cents: 20000n,
            needs_cents: 12000n,
          },
          {
            category_id: "N",
            month: "2026-07",
            planned_cents: 30000n,
            needs_cents: 18000n,
          },
        ];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [
          { day: "2026-06-15", spent_cents: 15000n },
          { day: "2026-06-20", spent_cents: 5000n },
          { day: "2026-07-15", spent_cents: 25000n },
        ];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-06-01",
        to: "2026-07-31",
      })
    )._unsafeUnwrap();
    expect(dto.bucket).toBe("daily");

    // June accumulates within itself…
    expect(dto.timeline.find((p) => p.label === "2026-06-15")!.real_cents).toBe(
      "15000",
    );
    expect(dto.timeline.find((p) => p.label === "2026-06-20")!.real_cents).toBe(
      "20000",
    );
    // …and July starts from zero again, not from June's 20000.
    expect(dto.timeline.find((p) => p.label === "2026-07-15")!.real_cents).toBe(
      "25000",
    );

    // The plan is each month's OWN limit, so it drops back at the boundary.
    expect(
      dto.timeline.find((p) => p.label === "2026-06-15")!.planned_cents,
    ).toBe("20000");
    expect(
      dto.timeline.find((p) => p.label === "2026-07-15")!.planned_cents,
    ).toBe("30000");
  });

  test("a new month opens with a zero point so the line drops, not slides", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "N", month: "2026-06", planned_cents: 20000n },
          { category_id: "N", month: "2026-07", planned_cents: 30000n },
        ];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [
          { day: "2026-06-15", spent_cents: 15000n },
          { day: "2026-07-15", spent_cents: 25000n },
        ];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-06-01",
        to: "2026-07-31",
      })
    )._unsafeUnwrap();

    const julyFirst = dto.timeline.find((p) => p.label === "2026-07-01")!;
    expect(julyFirst).toBeDefined();
    expect(julyFirst.real_cents).toBe("0");
    expect(julyFirst.planned_cents).toBe("30000");
    // …and it sits BEFORE July's spend day.
    const labels = dto.timeline.map((p) => p.label);
    expect(labels.indexOf("2026-07-01")).toBeLessThan(
      labels.indexOf("2026-07-15"),
    );
  });

  test("single-month daily bucket keeps the plain monthly limit (no accumulation)", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          {
            category_id: "N",
            month: "2026-07",
            planned_cents: 30000n,
            needs_cents: 18000n,
          },
        ];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [{ day: "2026-07-10", spent_cents: 5000n }];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-07-01",
        to: "2026-07-31",
      })
    )._unsafeUnwrap();
    for (const point of dto.timeline) {
      expect(point.planned_cents).toBe("30000");
      expect(point.needs_cents).toBe("18000");
    }
  });

  test("timeline splits planned into needs (cushion) + wants (planned − needs)", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          {
            category_id: "N",
            month: "2026-01",
            planned_cents: 30000n,
            needs_cents: 20000n, // cushion/essential
          },
        ];
      },
      async monthlySpendByCategory() {
        return [{ category_id: "N", month: "2026-01", spent_cents: 5000n }];
      },
      async categoryWindows() {
        return [
          {
            category_id: "N",
            name: "Groceries",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    const jan = dto.timeline.find((t) => t.label === "2026-01")!;
    expect(jan.planned_cents).toBe("30000");
    expect(jan.needs_cents).toBe("20000");
    expect(jan.wants_cents).toBe("10000"); // planned − needs
  });

  test("daily bucket, NO spend AND no planned → timeline stays empty (message shows)", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [];
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-01-15",
      })
    )._unsafeUnwrap();
    expect(dto.timeline).toEqual([]);
  });

  test("daily bucket, a SELECTED category with 0 budget draws a 0-line, not empty (item 2)", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return []; // the selected category has no planned limit → 0
      },
      async monthlySpendByCategory() {
        return [];
      },
      async categoryWindows() {
        return [];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-01-15",
        categoryId: "some-cat", // a category IS selected
      })
    )._unsafeUnwrap();
    // A 0-line (two endpoints) instead of the "No activity" message.
    expect(dto.timeline.map((t) => t.label)).toEqual([
      "2026-01-01",
      "2026-01-15",
    ]);
    expect(dto.timeline.every((t) => t.planned_cents === "0")).toBe(true);
  });

  test("splits each month's spend into limit, reserve and overspend", async () => {
    // 260801 (user decision): the line is coloured by WHERE THE MONEY CAME FROM.
    // Food: limit 100, reserve 50, spent 175 → 100 from the plan, 50 from the
    // reserve, 25 overspent. The three always sum to what was spent, so the
    // chart can colour the line in exactly those proportions.
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "FOOD", month: "2026-06", planned_cents: 10000n },
          { category_id: "FUN", month: "2026-06", planned_cents: 5000n },
        ];
      },
      async monthlySpendByCategory() {
        return [
          { category_id: "FOOD", month: "2026-06", spent_cents: 17500n },
          { category_id: "FUN", month: "2026-06", spent_cents: 2000n },
        ];
      },
      async categoryWindows() {
        return [
          {
            category_id: "FOOD",
            name: "Food",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
          {
            category_id: "FUN",
            name: "Fun",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const positions = new Map([
      [
        "FOOD",
        {
          byMonth: new Map([
            ["2026-06", { usedCents: 5000n, endReserveCents: 0n }],
          ]),
        },
      ],
    ]);
    const svc = getOverviewPlanned({
      repo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      reservePositions: async () => ok({ positions }) as never,
    } as GetOverviewPlannedDeps);

    // A multi-month range so the MONTHLY bucket (whole-month totals) answers.
    const dto = (
      await svc({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-04-01",
        to: "2026-06-30",
      })
    )._unsafeUnwrap();
    const point = dto.timeline.find((p) => p.label === "2026-06")!;
    // FOOD spent 17500 of a 10000 limit; FUN spent 2000 of 5000 — all within.
    expect(point.real_cents).toBe("19500");
    expect(point.within_limit_cents).toBe("12000");
    expect(point.reserve_used_cents).toBe("5000");
    // The three parts account for every cent spent.
    expect(point.overspent_cents).toBe("2500");
    expect(
      BigInt(point.within_limit_cents) +
        BigInt(point.reserve_used_cents) +
        BigInt(point.overspent_cents),
    ).toBe(BigInt(point.real_cents));
  });

  test("a category filter scopes the split too", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "FOOD", month: "2026-06", planned_cents: 10000n },
          { category_id: "FUN", month: "2026-06", planned_cents: 5000n },
        ];
      },
      async monthlySpendByCategory() {
        return [
          { category_id: "FOOD", month: "2026-06", spent_cents: 17500n },
          { category_id: "FUN", month: "2026-06", spent_cents: 9000n },
        ];
      },
      async categoryWindows() {
        return [
          {
            category_id: "FOOD",
            name: "Food",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
          {
            category_id: "FUN",
            name: "Fun",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const positions = new Map([
      [
        "FOOD",
        {
          byMonth: new Map([
            ["2026-06", { usedCents: 5000n, endReserveCents: 0n }],
          ]),
        },
      ],
      [
        "FUN",
        {
          byMonth: new Map([
            ["2026-06", { usedCents: 1000n, endReserveCents: 0n }],
          ]),
        },
      ],
    ]);
    const point = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
        reservePositions: async () => ok({ positions }) as never,
      } as GetOverviewPlannedDeps)({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-06-01",
        to: "2026-06-30",
        categoryId: "FOOD",
      })
    )._unsafeUnwrap().timeline[0]!;
    expect(point.within_limit_cents).toBe("10000");
    expect(point.reserve_used_cents).toBe("5000");
  });

  test("reserve used can never exceed what the month overspent", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "A", month: "2026-06", planned_cents: 10000n }];
      },
      async monthlySpendByCategory() {
        return [{ category_id: "A", month: "2026-06", spent_cents: 8000n }];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "A",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    // A stale/large `used` cell must not colour a month that stayed inside its
    // limit — the split has to stay inside the spend.
    const positions = new Map([
      [
        "A",
        {
          byMonth: new Map([
            ["2026-06", { usedCents: 9000n, endReserveCents: 0n }],
          ]),
        },
      ],
    ]);
    const point = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
        reservePositions: async () => ok({ positions }) as never,
      } as GetOverviewPlannedDeps)({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-06-01",
        to: "2026-06-30",
      })
    )._unsafeUnwrap().timeline[0]!;
    expect(point.within_limit_cents).toBe("8000");
    expect(point.reserve_used_cents).toBe("0");
  });

  test("without the reserve seam the whole spend is limit-then-overspend", async () => {
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-03-31",
      })
    )._unsafeUnwrap();
    expect(dto.timeline.every((p) => p.reserve_used_cents === "0")).toBe(true);
    for (const p of dto.timeline)
      expect(BigInt(p.within_limit_cents)).toBeLessThanOrEqual(
        BigInt(p.real_cents),
      );
  });

  test("the range-end anchor belongs to ITS month, not the last one", async () => {
    // Each month restarts at zero, so an anchor in a month with no spend is a
    // zero — it used to carry the previous month's running total across the
    // boundary, which then read as a whole month overspent (user report).
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "A", month: "2026-07", planned_cents: 30000n },
          { category_id: "A", month: "2026-08", planned_cents: 30000n },
        ];
      },
      async monthlySpendByCategory() {
        return [{ category_id: "A", month: "2026-07", spent_cents: 25000n }];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "Food",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [
          { day: "2026-07-10", spent_cents: 10000n },
          { day: "2026-07-31", spent_cents: 15000n },
        ];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-07-01",
        to: "2026-08-02",
      })
    )._unsafeUnwrap();

    const anchor = dto.timeline[dto.timeline.length - 1]!;
    expect(anchor.label).toBe("2026-08-02");
    expect(anchor.real_cents).toBe("0");
    // …and July still ends at its own total.
    expect(dto.timeline.find((p) => p.label === "2026-07-31")!.real_cents).toBe(
      "25000",
    );
  });

  test("can leave the RUNNING month out of the per-category averages", async () => {
    // A month still in progress drags an average down against months that ran
    // their full course, so the chart offers to leave it out (user request).
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "A", month: "2026-06", planned_cents: 10000n },
          { category_id: "A", month: "2026-07", planned_cents: 10000n },
          { category_id: "A", month: "2026-08", planned_cents: 10000n },
        ];
      },
      async monthlySpendByCategory() {
        return [
          { category_id: "A", month: "2026-06", spent_cents: 12000n },
          { category_id: "A", month: "2026-07", spent_cents: 12000n },
          { category_id: "A", month: "2026-08", spent_cents: 600n },
        ];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "Food",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const svc = getOverviewPlanned({
      repo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
    });
    const range = {
      tenantId: "b1",
      budgetId: "b1",
      from: "2026-06-01",
      to: "2026-08-02",
      now: () => new Date("2026-08-02T00:00:00Z"),
    };

    const withAugust = (await svc(range))._unsafeUnwrap().plannedAvgVsReal[0]!;
    // (12000 + 12000 + 600) / 3
    expect(withAugust.real_avg_cents).toBe("8200");

    const withoutAugust = (
      await svc({ ...range, excludeCurrentMonth: true })
    )._unsafeUnwrap().plannedAvgVsReal[0]!;
    // (12000 + 12000) / 2 — the two months that actually ran their course.
    expect(withoutAugust.real_avg_cents).toBe("12000");
    expect(withoutAugust.planned_avg_cents).toBe("10000");
  });

  test("keeps the running month when it is all the range has", async () => {
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "A", month: "2026-08", planned_cents: 10000n }];
      },
      async monthlySpendByCategory() {
        return [{ category_id: "A", month: "2026-08", spent_cents: 600n }];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "Food",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const dto = (
      await getOverviewPlanned({
        repo,
        metaReader: {
          async getBudgetMeta() {
            return { default_currency: "USD" };
          },
        },
        fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
      })({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-08-01",
        to: "2026-08-02",
        excludeCurrentMonth: true,
        now: () => new Date("2026-08-02T00:00:00Z"),
      })
    )._unsafeUnwrap();
    expect(dto.plannedAvgVsReal[0]!.real_avg_cents).toBe("600");
  });

  test("scopes the timeline to a SET of categories", async () => {
    // The chart's picker is a multi-select now: the user unticks the categories
    // that drown out the rest (260802 request), so the filter is a set.
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [
          { category_id: "A", month: "2026-06", planned_cents: 10000n },
          { category_id: "B", month: "2026-06", planned_cents: 20000n },
          { category_id: "C", month: "2026-06", planned_cents: 40000n },
        ];
      },
      async monthlySpendByCategory() {
        return [
          { category_id: "A", month: "2026-06", spent_cents: 1000n },
          { category_id: "B", month: "2026-06", spent_cents: 2000n },
          { category_id: "C", month: "2026-06", spent_cents: 4000n },
        ];
      },
      async categoryWindows() {
        return ["A", "B", "C"].map((id) => ({
          category_id: id,
          name: id,
          created_month: "2026-01",
          archived_month: null,
          is_investment: false,
        }));
      },
      async dailySpend() {
        return [];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    const svc = getOverviewPlanned({
      repo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
    });
    const range = {
      tenantId: "b1",
      budgetId: "b1",
      from: "2026-05-01",
      to: "2026-07-31",
    };

    const two = (await svc({ ...range, categoryIds: ["A", "C"] }))
      ._unsafeUnwrap()
      .timeline.find((p) => p.label === "2026-06")!;
    expect(two.planned_cents).toBe("50000");
    expect(two.real_cents).toBe("5000");

    // An empty set means "no filter" — the same as not passing one at all.
    const none = (await svc({ ...range, categoryIds: [] }))
      ._unsafeUnwrap()
      .timeline.find((p) => p.label === "2026-06")!;
    expect(none.planned_cents).toBe("70000");
  });

  test("passes the whole set down to the DAILY query", async () => {
    let asked: string[] | undefined;
    const repo: GetOverviewPlannedDeps["repo"] = {
      async monthlyPlannedByCategory() {
        return [{ category_id: "A", month: "2026-08", planned_cents: 10000n }];
      },
      async monthlySpendByCategory() {
        return [{ category_id: "A", month: "2026-08", spent_cents: 1000n }];
      },
      async categoryWindows() {
        return [
          {
            category_id: "A",
            name: "A",
            created_month: "2026-01",
            archived_month: null,
            is_investment: false,
          },
        ];
      },
      async dailySpend(_b, _f, _t, categoryIds) {
        asked = categoryIds;
        return [{ day: "2026-08-02", spent_cents: 1000n }];
      },
      async activeRecurringRules() {
        return [];
      },
    };
    await getOverviewPlanned({
      repo,
      metaReader: {
        async getBudgetMeta() {
          return { default_currency: "USD" };
        },
      },
      fxProvider: fx() as GetOverviewPlannedDeps["fxProvider"],
    })({
      tenantId: "b1",
      budgetId: "b1",
      from: "2026-08-01",
      to: "2026-08-31",
      categoryIds: ["A", "B"],
    });
    expect(asked).toEqual(["A", "B"]);
  });
});
