/**
 * get-reserve-fit-exclusions-beyond-shortlist.test.ts — a spend the member set
 * aside stays set aside, wherever it sits in the list (user, 260813).
 *
 * Reported live: Insurance carries two monthly rules worth 798 zł. Every other
 * złoty of its history was ticked off as a one-off, so its ordinary habit is
 * nothing and the Future chart should read "expected 798". It read 808.
 *
 * The projection was subtracting exclusions read off the SHORTLIST — the five
 * biggest spends per category, over a size bar. The dialog now offers every
 * spend in the range, so the member ticked three small ones (108, 108, 127)
 * that the shortlist never carried: the ticks were saved, and the arithmetic
 * never saw them. ~343 zł over twelve months is the missing ten a month.
 *
 * The exclusions TABLE is the only honest source, and the repo already has the
 * query the planned chart uses. This is that query, wired into the projection.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import {
  getReserveFit,
  type GetReserveFitDeps,
} from "../../src/application/get-reserve-fit";

const zl = (n: number) => BigInt(Math.round(n * 100));
const INSURANCE = "11111111-1111-4111-8111-111111111111";
const BUDGET = "22222222-2222-4222-8222-222222222222";

/** Twelve months of scope: 2025-09 … 2026-08. */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const z = 2025 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});
/** The three months carrying an ordinary charge on top of the rules. */
const SMALL: Record<string, number> = {
  [MONTHS[1]!]: 108,
  [MONTHS[2]!]: 108,
  [MONTHS[6]!]: 127,
};

function deps(
  excludedRows: { month: string; cents: bigint }[],
): GetReserveFitDeps {
  return {
    overviewRepo: {
      categoryWindows: async () => [
        {
          category_id: INSURANCE,
          name: "Insurance",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
        },
      ],
      monthlyPlannedByCategory: async () =>
        MONTHS.map((month) => ({
          category_id: INSURANCE,
          month,
          planned_cents: zl(779),
        })),
      monthlySpendByCategory: async () =>
        MONTHS.map((month) => ({
          category_id: INSURANCE,
          month,
          spent_cents: zl(798 + (SMALL[month] ?? 0)),
          scheduled_cents: zl(798),
        })),
    } as unknown as GetReserveFitDeps["overviewRepo"],
    activeScheduledPayments: async () => [
      {
        category_id: INSURANCE,
        amount_cents: zl(436.17),
        cadence: "MONTHLY" as const,
        yearly_month: null,
        next_due_date: "2026-09-27",
        currency: "PLN",
      },
      {
        category_id: INSURANCE,
        amount_cents: zl(361.83),
        cadence: "MONTHLY" as const,
        yearly_month: null,
        next_due_date: "2026-09-27",
        currency: "PLN",
      },
    ],
    fxProvider: {
      rateAsOf: async () => ({ rate: "1" }),
    } as unknown as GetReserveFitDeps["fxProvider"],
    exclusionsRepo: {
      // The shortlist carries none of them: they are far under the bar, which
      // is the whole point of the report.
      largeTransactions: async () => [],
      excludedSpendByCategory: async () =>
        excludedRows.map((r) => ({
          category_id: INSURANCE,
          month: r.month,
          cents: r.cents,
        })),
    },
    reservePositions: async () =>
      ok({
        positions: new Map([
          [
            INSURANCE,
            {
              categoryId: INSURANCE,
              reserveCents: 0n,
              usedCents: 0n,
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map(),
            },
          ],
        ]),
        openMonth: "2026-09",
        internalCents: 0n,
        userDefinedCents: 0n,
        surplusCents: 0n,
      }) as never,
    metaReader: { getBudgetMeta: async () => ({ default_currency: "PLN" }) },
    now: () => new Date("2026-09-15T00:00:00Z"),
  };
}

const projectedFor = async (
  excluded: { month: string; cents: bigint }[],
): Promise<bigint> => {
  const res = await getReserveFit(deps(excluded))({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from: "2025-09-01",
    to: "2026-08-31",
  });
  if (res.isErr()) throw res.error;
  const row = res.value.projected_by_category.find(
    (p) => p.category_id === INSURANCE,
  );
  return BigInt(row!.projected_monthly_cents);
};

describe("a spend set aside outside the shortlist", () => {
  test("is left out of the habit, so the projection is the rules alone", async () => {
    const projected = await projectedFor(
      Object.entries(SMALL).map(([month, n]) => ({ month, cents: zl(n) })),
    );
    expect(projected).toBe(zl(798));
  });

  test("still counts while it is NOT set aside", async () => {
    // 343 zł of ordinary charges over twelve months — the ten a month the
    // household saw, proving the fixture reproduces the report.
    const projected = await projectedFor([]);
    expect(projected).toBe(zl(798) + zl(343) / 12n);
  });
});
