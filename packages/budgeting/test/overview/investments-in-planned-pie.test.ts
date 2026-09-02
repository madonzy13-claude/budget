/**
 * A no-limit Investments category still has a planned figure: what it invested.
 *
 * The planned-spend pie draws an INVESTING arc on its outer ring, and that arc
 * must stay whatever the category picker says — investing is part of how the
 * plan splits even when the slice itself is filtered out (user, 260803).
 *
 * It vanished. "No limit" became the default mode, and an unbounded category
 * stores a limit of 0 — so the arc had nothing to draw. Rule 0083 already says
 * what an unbounded category's implicit plan is (what it SPENT there), but the
 * substitution needed a stored row to substitute INTO, and a category that had
 * never carried a stored limit had no rows at all for its history.
 *
 * So the rule is applied by MODE, not by the presence of a row — the same shape
 * the smart mode already uses to inject a figure it never stores.
 */
import { describe, test, expect } from "bun:test";
import {
  getOverviewPlanned,
  type GetOverviewPlannedDeps,
} from "../../src/application/get-overview-planned";

const INV = "I";
const NORMAL = "N";
const MONTHS = ["2026-05", "2026-06", "2026-07"];

function build(mode: string | null) {
  const repo = {
    async monthlyPlannedByCategory() {
      // Only the ordinary category has stored limits. The investment category
      // is unbounded and stores nothing — the state this is about.
      return MONTHS.map((month) => ({
        category_id: NORMAL,
        month,
        planned_cents: 100000n,
        needs_cents: 100000n,
      }));
    },
    async monthlySpendByCategory() {
      return MONTHS.flatMap((month) => [
        { category_id: NORMAL, month, spent_cents: 90000n },
        { category_id: INV, month, spent_cents: 300000n },
      ]);
    },
    async categoryWindows() {
      return [
        {
          category_id: NORMAL,
          name: "Groceries",
          created_month: "2026-01",
          archived_month: null,
          is_investment: false,
        },
        {
          category_id: INV,
          name: "Investments",
          created_month: "2026-01",
          archived_month: null,
          is_investment: true,
          investment_limit_mode: mode,
        },
      ];
    },
    async dailySpend() {
      return [];
    },
    async activeScheduledPayments() {
      return [];
    },
  } as unknown as GetOverviewPlannedDeps["repo"];
  return {
    repo,
    metaReader: { getBudgetMeta: async () => ({ default_currency: "PLN" }) },
    fxProvider: { rateAsOf: async () => ({ rate: "1" }) },
    now: () => new Date("2026-08-05T00:00:00Z"),
  } as unknown as GetOverviewPlannedDeps;
}

async function plannedFor(mode: string | null) {
  const res = await getOverviewPlanned(build(mode))({
    tenantId: "B",
    budgetId: "B",
    from: "2026-05-01",
    to: "2026-07-31",
  });
  if (res.isErr()) throw res.error;
  const rows = (
    res.value as {
      plannedAvgVsReal: {
        category_id: string;
        planned_avg_cents: string;
        real_avg_cents: string;
      }[];
    }
  ).plannedAvgVsReal;
  return rows.find((r) => r.category_id === INV);
}

describe("an unbounded Investments category in the planned pie", () => {
  test("its plan is what it invested, so the arc has a value to draw", async () => {
    // 3,000 a month invested, and no stored limit anywhere. A planned figure
    // of 0 is what made the arc disappear from the ring.
    const row = await plannedFor("none");
    expect({
      planned: row?.planned_avg_cents,
      real: row?.real_avg_cents,
    }).toEqual({ planned: "300000", real: "300000" });
  });

  test("a manual category is left alone", async () => {
    // It stores its own limit; substituting spend would overwrite the figure
    // the member typed. No stored rows in this fixture, so it stays 0.
    const row = await plannedFor("manual");
    expect(row?.planned_avg_cents).toBe("0");
  });
});
