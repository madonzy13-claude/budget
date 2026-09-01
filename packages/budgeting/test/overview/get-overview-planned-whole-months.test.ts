/**
 * The planned-vs-real AVERAGES must cover as many whole months as were asked
 * for — the same rule the reserve requirement follows, for the same reason.
 *
 * These two figures are what the limit suggestion is read from. They already
 * dropped the month still running (a few days of spend against a whole month's
 * limit is not a rate), but the window ended at TODAY, so dropping it shortened
 * the sample instead of excluding a month: on the 1st, a year averaged eleven.
 *
 * The CHART is deliberately untouched. A part-finished month is a short bar,
 * which is honest; hiding it would hide the month the reader most wants.
 */
import { describe, test, expect } from "bun:test";
import {
  getOverviewPlanned,
  type GetOverviewPlannedDeps,
} from "../../src/application/get-overview-planned";

const CAT = "C";
/** Two years of history so a widened window always has data behind it. */
const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const z = 2024 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

function build(seen: { from?: string }) {
  const inRange = (from: string, to: string) =>
    MONTHS.filter((m) => m >= from.slice(0, 7) && m <= to.slice(0, 7));
  const repo = {
    async monthlyPlannedByCategory(_b: string, from: string, to: string) {
      seen.from = from;
      return inRange(from, to).map((month) => ({
        category_id: CAT,
        month,
        planned_cents: 60000n,
      }));
    },
    async monthlySpendByCategory(_b: string, from: string, to: string) {
      return inRange(from, to).map((month) => ({
        category_id: CAT,
        month,
        spent_cents: 50000n,
      }));
    },
    async categoryWindows() {
      return [
        {
          category_id: CAT,
          name: "Gifts",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
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
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    fxProvider: { rateAsOf: async () => ({ rate: "1" }) },
    // 5 September: September cannot be a rate.
    now: () => new Date("2026-09-05T00:00:00Z"),
  } as unknown as GetOverviewPlannedDeps;
}

async function run(from: string, to: string) {
  const seen: { from?: string } = {};
  const res = await getOverviewPlanned(build(seen))({
    tenantId: "B",
    budgetId: "B",
    from,
    to,
    excludeCurrentMonth: true,
  });
  if (res.isErr()) throw res.error;
  const v = res.value as {
    plannedAvgVsReal: { planned_avg_cents: string; real_avg_cents: string }[];
    timeline: { label: string }[];
  };
  return { row: v.plannedAvgVsReal[0], seen, timeline: v.timeline };
}

describe("planned averages cover whole months", () => {
  test("reads a full year back when September is dropped", async () => {
    // 1Y ending in the running month has to start in September 2025, not
    // October, or the average is over eleven months while claiming a year.
    const { seen } = await run("2025-10-01", "2026-09-30");
    expect(seen.from).toBe("2025-09-01");
  });

  test("the averages themselves are unchanged by the widening", async () => {
    // Every stubbed month is identical (600 planned / 500 spent), so a correct
    // window of ANY length averages to the same figures. What this guards is
    // that the extra month arrives with DATA — an empty one would drag both
    // averages down, which is worse than the bug being fixed.
    const { row } = await run("2025-10-01", "2026-09-30");
    expect({
      planned: row?.planned_avg_cents,
      real: row?.real_avg_cents,
    }).toEqual({ planned: "60000", real: "50000" });
  });

  test("a range already ended is read exactly as asked", async () => {
    const { seen } = await run("2026-01-01", "2026-03-31");
    expect(seen.from).toBe("2026-01-01");
  });
});
