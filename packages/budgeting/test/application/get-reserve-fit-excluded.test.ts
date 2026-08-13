/**
 * get-reserve-fit-excluded.test.ts — a category the household opted OUT of the
 * reserve still costs money (user, 260812).
 *
 * Reported from the live app: Insurance carries two monthly payments totalling
 * 798 zł against a 779 limit, and the Future chart's tooltip read
 *   Current limit   779 zł
 *   Expected spend  779 zł
 * — the two identical, which is the shape of a fallback rather than an answer.
 * It was: the reserve fit skips reserve-excluded categories entirely, so no
 * projected figure reached the chart and it fell back to the limit itself.
 *
 * The reserve SIZING is rightly none of an excluded category's business. What
 * it will cost in an average month is a different question, asked by a
 * different chart, and it has an answer for every category.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import {
  getReserveFit,
  type GetReserveFitDeps,
} from "../../src/application/get-reserve-fit";

const zl = (n: number) => BigInt(Math.round(n * 100));
const INSURANCE = "11111111-1111-4111-8111-111111111111";
const FOOD = "33333333-3333-4333-8333-333333333333";
const BUDGET = "22222222-2222-4222-8222-222222222222";

const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const z = 2025 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

/** Insurance: 779 planned, two monthly rules worth 798, no ordinary spend on
 *  top (every złoty of its history is linked to those rules). Food is an
 *  ordinary tracked category, present so the excluded one is not the only row. */
function deps(): GetReserveFitDeps {
  const cats = [INSURANCE, FOOD];
  return {
    overviewRepo: {
      categoryWindows: async () =>
        cats.map((category_id) => ({
          category_id,
          name: category_id === INSURANCE ? "Insurance" : "Food",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
        })),
      monthlyPlannedByCategory: async () =>
        cats.flatMap((category_id) =>
          MONTHS.map((month) => ({
            category_id,
            month,
            planned_cents: zl(category_id === INSURANCE ? 779 : 500),
          })),
        ),
      monthlySpendByCategory: async () =>
        cats.flatMap((category_id) =>
          MONTHS.map((month) => ({
            category_id,
            month,
            spent_cents: zl(category_id === INSURANCE ? 798 : 500),
            // Insurance's spend IS the rules; Food's is ordinary.
            scheduled_cents: category_id === INSURANCE ? zl(798) : 0n,
          })),
        ),
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
      largeTransactions: async () => [],
      excludedSpendByCategory: async () => [],
    },
    reservePositions: async () =>
      ok({
        positions: new Map(
          cats.map((categoryId) => [
            categoryId,
            {
              categoryId,
              reserveCents: 0n,
              usedCents: 0n,
              overspentCents: 0n,
              // …the household opted Insurance out of the reserve.
              reserveExcluded: categoryId === INSURANCE,
              byMonth: new Map(),
            },
          ]),
        ),
        openMonth: "2026-09",
        internalCents: 0n,
        userDefinedCents: 0n,
        surplusCents: 0n,
      }) as never,
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    now: () => new Date("2026-09-15T00:00:00Z"),
  };
}

const run = async () => {
  const res = await getReserveFit(deps())({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from: "2025-09-01",
    to: "2026-08-31",
  });
  if (res.isErr()) throw res.error;
  return res.value;
};

describe("what an excluded category will cost", () => {
  test("is reported, even though it gets no reserve row", async () => {
    const fit = await run();
    // The reserve chart still has nothing to say about it…
    expect(fit.rows.map((r) => r.category_id)).not.toContain(INSURANCE);
    // …but the Future chart asks a different question, and gets an answer.
    const projected = new Map(
      fit.projected_by_category.map((p) => [
        p.category_id,
        BigInt(p.projected_monthly_cents),
      ]),
    );
    expect(projected.get(INSURANCE)).toBe(zl(798));
  });

  test("counts the CURRENT amount of a recurring payment, not the limit", async () => {
    const fit = await run();
    const insurance = fit.projected_by_category.find(
      (p) => p.category_id === INSURANCE,
    )!;
    // 779 is the limit; the two rules are 798 today. The chart must draw the
    // second against the first, not the first against itself.
    expect(insurance.projected_monthly_cents).not.toBe(zl(779).toString());
  });

  test("tracked categories keep theirs", async () => {
    const fit = await run();
    const food = fit.projected_by_category.find((p) => p.category_id === FOOD)!;
    expect(BigInt(food.projected_monthly_cents)).toBe(zl(500));
    expect(fit.rows.map((r) => r.category_id)).toContain(FOOD);
  });
});

/**
 * …and the same category's one-off spends must still be offered for ticking.
 *
 * "Which spend won't happen again" listed only categories that earn a reserve
 * row, so a big spend inside an opted-out one could never be set aside — the
 * dialog did not know it existed (user, 260812).
 */
describe("one-offs of an excluded category", () => {
  const withLarge = (): GetReserveFitDeps => {
    const base = deps();
    return {
      ...base,
      exclusionsRepo: {
        largeTransactions: async () => [
          {
            ledger_id: "tx-roof",
            category_id: INSURANCE,
            transaction_date: "2026-03-14",
            note: "Roof",
            amount_cents: zl(9000),
            scheduled_cadence: null,
            excluded: false,
          },
          {
            ledger_id: "tx-food",
            category_id: FOOD,
            transaction_date: "2026-04-02",
            note: "Freezer",
            amount_cents: zl(4000),
            scheduled_cadence: null,
            excluded: false,
          },
        ],
        excludedSpendByCategory: async () => [],
      } as unknown as GetReserveFitDeps["exclusionsRepo"],
    };
  };

  test("are offered like anyone else's, with their category named", async () => {
    const res = await getReserveFit(withLarge())({
      tenantId: BUDGET,
      budgetId: BUDGET,
      from: "2025-09-01",
      to: "2026-08-31",
    });
    if (res.isErr()) throw res.error;
    const offered = res.value.one_off_candidates;
    expect(offered.map((c) => c.ledger_id).sort()).toEqual([
      "tx-food",
      "tx-roof",
    ]);
    const roof = offered.find((c) => c.ledger_id === "tx-roof")!;
    expect(roof.category_id).toBe(INSURANCE);
    expect(roof.category_name).toBe("Insurance");
    // …while the reserve chart still has no row for it.
    expect(res.value.rows.map((r) => r.category_id)).not.toContain(INSURANCE);
  });
});

/**
 * A spend that repeats is not a one-off (user, 260813).
 *
 * The dialog asks "which spend won't happen again". A charge linked to a
 * MONTHLY rule will happen again next month by construction, so ticking it is
 * always wrong — and it was worse than useless: two of Insurance's five
 * shortlist slots were taken by the same NN premium, crowding out the genuine
 * one-offs underneath. A ONCE payment is a real single purchase and stays.
 */
describe("recurring payments are not one-off candidates", () => {
  const withMixedSpends = (): GetReserveFitDeps => {
    const base = deps();
    return {
      ...base,
      exclusionsRepo: {
        largeTransactions: async () => [
          {
            ledger_id: "tx-monthly",
            category_id: INSURANCE,
            transaction_date: "2026-03-27",
            note: "NN premium",
            amount_cents: zl(436),
            scheduled_cadence: "MONTHLY",
            excluded: false,
          },
          {
            ledger_id: "tx-yearly",
            category_id: INSURANCE,
            transaction_date: "2026-02-14",
            note: "Car insurance",
            amount_cents: zl(3300),
            scheduled_cadence: "YEARLY",
            excluded: false,
          },
          {
            ledger_id: "tx-once",
            category_id: INSURANCE,
            transaction_date: "2026-04-01",
            note: "Sofa",
            amount_cents: zl(2000),
            scheduled_cadence: "ONCE",
            excluded: false,
          },
          {
            ledger_id: "tx-plain",
            category_id: INSURANCE,
            transaction_date: "2026-05-15",
            note: "Roof",
            amount_cents: zl(9000),
            scheduled_cadence: null,
            excluded: false,
          },
        ],
        excludedSpendByCategory: async () => [],
      } as unknown as GetReserveFitDeps["exclusionsRepo"],
    };
  };

  test("a repeating charge is never offered; a one-time one is", async () => {
    const res = await getReserveFit(withMixedSpends())({
      tenantId: BUDGET,
      budgetId: BUDGET,
      from: "2025-09-01",
      to: "2026-08-31",
    });
    if (res.isErr()) throw res.error;
    const offered = res.value.one_off_candidates.map((c) => c.ledger_id);
    expect(offered).toContain("tx-plain");
    expect(offered).toContain("tx-once");
    expect(offered).not.toContain("tx-monthly");
    expect(offered).not.toContain("tx-yearly");
  });
});
