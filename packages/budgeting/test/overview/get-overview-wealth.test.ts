/**
 * get-overview-wealth.test.ts — RED (11-06 Task 1).
 *
 * Financial-Wealth section service (D-04/15/16/17/18/20): a value time-series
 * from the 3h budget_wealth_snapshots aggregated to the range bucket
 * (last-in-bucket), with a live current point appended via computeBudgetWealthNow
 * so the rightmost bucket is up to date. grow/loss (delta + %), month-over-month
 * dynamics, monthly-average grow (mean of MoM %, skipping zero-start steps), and a
 * per-holding-type pie for the investments view. No cost-basis (D-17).
 */
import { describe, test, expect } from "bun:test";
import {
  getOverviewWealth,
  type GetOverviewWealthDeps,
} from "@budget/budgeting/src/application/get-overview-wealth";

/** Three monthly samples + a same-month earlier Jan row (proves last-in-bucket). */
function snapshotRepo(): GetOverviewWealthDeps["snapshotRepo"] {
  return {
    async seriesForRange() {
      return [
        // Jan: 90000 then 100000 → last-in-bucket = 100000
        {
          captured_at: new Date("2026-01-05T00:00:00Z"),
          capitalization_cents: 90000n,
          investment_value_cents: 45000n,
        },
        {
          captured_at: new Date("2026-01-31T00:00:00Z"),
          capitalization_cents: 100000n,
          investment_value_cents: 50000n,
        },
        {
          captured_at: new Date("2026-02-28T00:00:00Z"),
          capitalization_cents: 110000n,
          investment_value_cents: 55000n,
        },
        {
          captured_at: new Date("2026-03-15T00:00:00Z"),
          capitalization_cents: 105000n,
          investment_value_cents: 52000n,
        },
      ];
    },
  };
}

function computeWealthNow(): GetOverviewWealthDeps["computeWealthNow"] {
  return async () => ({
    capitalization_cents: 108000n,
    investment_value_cents: 56000n,
    currency: "USD",
  });
}

function holdingsByType(): GetOverviewWealthDeps["holdingsByType"] {
  return {
    async valueByType() {
      return [
        { holding_type: "STOCK", value_cents: 36000n },
        { holding_type: "CRYPTO", value_cents: 20000n },
      ];
    },
  };
}

function deps(over?: Partial<GetOverviewWealthDeps>): GetOverviewWealthDeps {
  return {
    snapshotRepo: snapshotRepo(),
    computeWealthNow: computeWealthNow(),
    holdingsByType: holdingsByType(),
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "USD" };
      },
    },
    ...over,
  };
}

const base = {
  tenantId: "b1",
  budgetId: "b1",
  from: "2026-01-01",
  to: "2026-03-31",
  now: () => new Date("2026-03-20T12:00:00Z"),
};

describe("getOverviewWealth", () => {
  test("capitalization series: last-in-bucket + live point overrides current bucket (D-04/D-20)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    expect(dto.currency).toBe("USD");
    expect(dto.view).toBe("capitalization");
    expect(dto.bucket).toBe("monthly");
    expect(dto.series.map((p) => p.label)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // Jan last-in-bucket 100000; Feb 110000; Mar live 108000 overrides 105000
    expect(dto.series.map((p) => p.value_cents)).toEqual([
      "100000",
      "110000",
      "108000",
    ]);
  });

  test("grow/loss = end − start over the range (D-15)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    expect(dto.grow.delta_cents).toBe("8000"); // 108000 − 100000
    expect(dto.grow.delta_pct).toBeCloseTo(8.0, 5); // 8000 / 100000
  });

  test("month-over-month dynamics + monthly_avg_grow = mean of MoM % (D-16)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    expect(dto.dynamics.map((d) => d.label)).toEqual(["2026-02", "2026-03"]);
    expect(dto.dynamics[0]!.pct).toBeCloseTo(10.0, 5); // (110000−100000)/100000
    expect(dto.dynamics[1]!.pct).toBeCloseTo(-1.818181, 4); // (108000−110000)/110000
    expect(dto.monthly_avg_grow_pct).toBeCloseTo((10 + -1.818181) / 2, 4);
  });

  test("zero-start: delta_pct null and the 0→x step is skipped from the mean", async () => {
    const zeroRepo: GetOverviewWealthDeps["snapshotRepo"] = {
      async seriesForRange() {
        return [
          {
            captured_at: new Date("2026-01-31T00:00:00Z"),
            capitalization_cents: 0n,
            investment_value_cents: 0n,
          },
          {
            captured_at: new Date("2026-02-28T00:00:00Z"),
            capitalization_cents: 50000n,
            investment_value_cents: 0n,
          },
        ];
      },
    };
    const liveZero: GetOverviewWealthDeps["computeWealthNow"] = async () => ({
      capitalization_cents: 60000n,
      investment_value_cents: 0n,
      currency: "USD",
    });
    const dto = (
      await getOverviewWealth(
        deps({ snapshotRepo: zeroRepo, computeWealthNow: liveZero }),
      )({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    // start = 0 → delta_pct null
    expect(dto.grow.delta_pct).toBeNull();
    // Feb step is 0→50000 (null, skipped); Mar step 50000→60000 = +20
    const feb = dto.dynamics.find((d) => d.label === "2026-02")!;
    expect(feb.pct).toBeNull();
    expect(dto.monthly_avg_grow_pct).toBeCloseTo(20.0, 5); // only the Mar step counts
  });

  test("investments view: series uses investment_value_cents + per-type pie (D-18)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "investments" })
    )._unsafeUnwrap();
    expect(dto.view).toBe("investments");
    // Jan last-in-bucket 50000; Feb 55000; Mar live 56000
    expect(dto.series.map((p) => p.value_cents)).toEqual([
      "50000",
      "55000",
      "56000",
    ]);
    expect(dto.pie).toEqual([
      { holding_type: "STOCK", value_cents: "36000" },
      { holding_type: "CRYPTO", value_cents: "20000" },
    ]);
  });

  test("capitalization view: pie is null (D-18)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    expect(dto.pie).toBeNull();
  });
});
