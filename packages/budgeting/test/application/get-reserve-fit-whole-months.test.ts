/**
 * A range asked for in months must be averaged over that many WHOLE months.
 *
 * The reserve requirement drops the month still running — a few days of spend
 * against a whole month's limit is not a rate — but the window ran from a date
 * to TODAY, so dropping it just shortened the sample. On 1 September a "1Y"
 * range analysed 11 months, "3M" analysed 2. The same budget gave different
 * advice depending on which day it was opened.
 *
 * Two halves to the fix, and this pins both: the COUNT the caller asked for,
 * and the window actually being READ far enough back to supply it. Widening
 * the month list without widening the query would count the extra month as
 * empty — worse than the bug.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import {
  getReserveFit,
  type GetReserveFitDeps,
} from "../../src/application/get-reserve-fit";

const zl = (n: number) => BigInt(Math.round(n * 100));
const CAT = "33333333-3333-4333-8333-333333333333";
const BUDGET = "44444444-4444-4444-8444-444444444444";

/** Two years of history, so a widened window always has data behind it. */
const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const z = 2024 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

/** The stubbed months that fall inside a requested range. */
const inRange = (from: string, to: string) =>
  MONTHS.filter((m) => m >= from.slice(0, 7) && m <= to.slice(0, 7));

/** Records the range each repo call was asked for. */
function deps(seen: { from?: string; to?: string }): GetReserveFitDeps {
  return {
    // 2026-09-05: five days into September, so September cannot be a rate.
    now: () => new Date("2026-09-05T00:00:00Z"),
    overviewRepo: {
      categoryWindows: async () => [
        {
          category_id: CAT,
          name: "Gifts",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
        },
      ],
      // Honours the range it is handed, like a real repo — a stub that ignored
      // its arguments could not test a change about those arguments.
      monthlyPlannedByCategory: async (
        _b: string,
        from: string,
        to: string,
      ) => {
        seen.from = from;
        seen.to = to;
        return inRange(from, to).map((month) => ({
          category_id: CAT,
          month,
          planned_cents: zl(600),
        }));
      },
      monthlySpendByCategory: async (_b: string, from: string, to: string) =>
        inRange(from, to).map((month) => ({
          category_id: CAT,
          month,
          spent_cents: zl(500),
          scheduled_cents: 0n,
        })),
    } as unknown as GetReserveFitDeps["overviewRepo"],
    activeScheduledPayments: async () => [],
    fxProvider: {
      rateAsOf: async () => ({ rate: "1" }),
    } as unknown as GetReserveFitDeps["fxProvider"],
    exclusionsRepo: {
      largeTransactions: async () => [],
      excludedSpendByCategory: async () => [],
    },
    reservePositions: async () =>
      ok({
        userDefinedCents: 0n,
        positions: new Map([
          [
            CAT,
            {
              categoryId: CAT,
              reserveCents: zl(1000),
              usedCents: 0n,
              overspentCents: 0n,
              reserveExcluded: false,
            },
          ],
        ]),
      }),
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    } as unknown as GetReserveFitDeps["metaReader"],
  } as unknown as GetReserveFitDeps;
}

async function run(from: string, to: string) {
  const seen: { from?: string; to?: string } = {};
  const res = await getReserveFit(deps(seen))({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from,
    to,
  });
  if (res.isErr()) throw res.error;
  const row = (res.value as { rows: { months_counted: number }[] }).rows[0]!;
  return { months: row.months_counted, seen };
}

describe("a range in months means that many whole months", () => {
  test("1Y asked for in early September analyses twelve, not eleven", async () => {
    const { months } = await run("2025-10-01", "2026-09-30");
    expect(months).toBe(12);
  });

  test("…and reads far enough back to have twelve months of data", async () => {
    // The half that makes the count honest. September is dropped, so the
    // window has to start in September 2025 rather than October.
    const { seen } = await run("2025-10-01", "2026-09-30");
    expect(seen.from).toBe("2025-09-01");
  });

  test("3M asked for gives three whole months", async () => {
    const { months, seen } = await run("2026-07-01", "2026-09-30");
    expect({ months, from: seen.from }).toEqual({
      months: 3,
      from: "2026-06-01",
    });
  });

  test("a range that has already ended is read exactly as asked", async () => {
    // Nothing in it is running, so there is nothing to compensate for.
    const { months, seen } = await run("2026-01-01", "2026-03-31");
    expect({ months, from: seen.from }).toEqual({
      months: 3,
      from: "2026-01-01",
    });
  });
});
