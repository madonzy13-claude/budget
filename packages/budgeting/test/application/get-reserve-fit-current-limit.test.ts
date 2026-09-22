/**
 * get-reserve-fit-current-limit.test.ts — "current" means TODAY's limit, even
 * when today is outside the window being charted (user, 260922).
 *
 * "Just rebalanced Car based on the suggestion and right away it suggested me
 * another amount, why?"
 *
 * Because the row was not measuring against the limit the member had just set.
 * `currentLimit` is looked up as `limitByCell[category|nowMonth]`, and
 * `limitByCell` is built from `monthlyPlannedByCategory(budgetId, from, to)` —
 * the CHARTED range. The Future chart's default range is the twelve closed
 * months, which end before the running one, so the running month has no cell
 * and the lookup falls through to "the last month in range that had a limit".
 *
 * Live (Car, 260922): September's limit is 900, August's is 662. The row
 * suggested 856.42 and reported a delta of +194.42 — measured off 662. Against
 * the 900 actually in force the gap is 43.58, under the whole unit the dialog
 * calls a move, so there was nothing to suggest at all. The member set 857, the
 * row went on measuring from 662, and asked again.
 *
 * The function's own comment already says which limit is meant: "the limit in
 * the RUNNING month, not the last month of the range, so a past window still
 * reports today's limit".
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import {
  getReserveFit,
  type GetReserveFitDeps,
} from "../../src/application/get-reserve-fit";

const zl = (n: number) => BigInt(Math.round(n * 100));
const CAT = "11111111-1111-4111-8111-111111111111";
const BUDGET = "22222222-2222-4222-8222-222222222222";
const OPEN_MONTH = "2026-09";

/** Sep 2025 → Aug 2026: the twelve CLOSED months the chart defaults to. */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const z = 2025 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

/** Lumpy, so history asks for a buffer and a suggestion exists at all. */
const SPEND: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m, i === 3 || i === 8 ? 3000 : 900]),
);

/** What the closed months ran on, and what the member is running on TODAY. */
const RANGE_LIMIT = 662;
const TODAY_LIMIT = 900;

function deps(): GetReserveFitDeps {
  return {
    overviewRepo: {
      categoryWindows: async () => [
        {
          category_id: CAT,
          name: "Car",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
        },
      ],
      // Range-aware, like the SQL behind it: ask for the closed months and the
      // running month is simply not in the answer.
      monthlyPlannedByCategory: async (
        _budgetId: string,
        from: string,
        to: string,
      ) => {
        const rows = MONTHS.map((month) => ({
          category_id: CAT,
          month,
          planned_cents: zl(RANGE_LIMIT),
        }));
        rows.push({
          category_id: CAT,
          month: OPEN_MONTH,
          planned_cents: zl(TODAY_LIMIT),
        });
        return rows.filter(
          (r) => r.month >= from.slice(0, 7) && r.month <= to.slice(0, 7),
        );
      },
      monthlySpendByCategory: async () =>
        MONTHS.map((month) => ({
          category_id: CAT,
          month,
          spent_cents: zl(SPEND[month]!),
          scheduled_cents: 0n,
        })),
    } as unknown as GetReserveFitDeps["overviewRepo"],
    activeScheduledPayments: async () => [
      {
        category_id: CAT,
        amount_cents: zl(3986),
        cadence: "YEARLY" as const,
        yearly_month: 10,
        next_due_date: "2026-10-15",
        currency: "PLN",
      },
    ],
    fxProvider: {
      rateAsOf: async () => ({ rate: "1" }),
    } as unknown as GetReserveFitDeps["fxProvider"],
    exclusionsRepo: {
      largeTransactions: async () => [],
      excludedSpendByCategory: async () => [],
    },
    reservePositions: async () =>
      ok({
        positions: new Map([
          [
            CAT,
            {
              categoryId: CAT,
              reserveCents: zl(8191),
              usedCents: zl(3086),
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map([
                [
                  OPEN_MONTH,
                  {
                    usedCents: zl(3086),
                    overspentCents: 0n,
                    overageCents: zl(3086),
                    leftCents: 0n,
                    endReserveCents: zl(8191),
                  },
                ],
              ]),
            },
          ],
        ]),
        openMonth: OPEN_MONTH,
        internalCents: zl(8191),
        userDefinedCents: zl(8191),
        surplusCents: 0n,
      }) as never,
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    now: () => new Date("2026-09-22T00:00:00Z"),
  };
}

const chartedRow = async () => {
  const res = await getReserveFit(deps())({
    tenantId: BUDGET,
    budgetId: BUDGET,
    // The Future chart's own default: the closed months, ending BEFORE today.
    from: "2025-09-01",
    to: "2026-08-31",
  });
  if (res.isErr()) throw res.error;
  return res.value.rows[0]!;
};

describe("the limit a suggestion is measured against", () => {
  test("is the one in force today, not the last one in the charted range", async () => {
    const row = await chartedRow();
    if (row.suggested_limit_cents === null) {
      // Nothing to suggest is a legitimate answer — but only if it was reached
      // by comparing against TODAY's limit.
      return;
    }
    // delta = projected − currentLimit, so this recovers the limit it used.
    const measuredAgainst =
      BigInt(row.suggested_limit_cents) - BigInt(row.suggested_delta_cents!);
    expect(measuredAgainst).toBe(zl(TODAY_LIMIT));
  });

  test("so a change smaller than a whole unit is not worth suggesting", async () => {
    const row = await chartedRow();
    if (row.suggested_limit_cents === null) return;
    const from =
      BigInt(row.suggested_limit_cents) - BigInt(row.suggested_delta_cents!);
    const gap =
      BigInt(row.suggested_limit_cents) > from
        ? BigInt(row.suggested_limit_cents) - from
        : from - BigInt(row.suggested_limit_cents);
    expect(gap).toBeGreaterThanOrEqual(100n);
  });
});
