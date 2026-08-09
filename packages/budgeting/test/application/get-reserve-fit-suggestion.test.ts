/**
 * get-reserve-fit-suggestion.test.ts — the suggestion has to survive being
 * taken (user, 260809).
 *
 * The chart offers "set the limit to X", and beside it says what the reserve
 * will need once you do. Travel, live: it promised a reserve of 17,000 against
 * 17,315 held — 315 spare — and the moment the limit was set to the suggested
 * 2,669 the same row read "add 1,403".
 *
 * The reason is that HALF of `needed` comes from history, and history is judged
 * against the limit in force: drop the limit and past months look overspent, so
 * the buffer they ask for grows. The forecast reused the historical figure
 * worked out at the OLD limit, which is wrong in precisely the case the
 * forecast exists for — the one where the limit moves.
 *
 * So the property, stated once: what the row says you will need THERE is what
 * the row says you need once you are there.
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

/** Sep 2025 → Aug 2026, the twelve closed months of the range. */
const MONTHS = Array.from({ length: 12 }, (_, i) => {
  const z = 2025 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

/**
 * A category whose ordinary spending is LUMPY: 1,800 most months and 9,000 in
 * two of them. How big a buffer those two months ask for depends entirely on
 * the limit they are judged against — which is the whole point here. The
 * scheduled commitment is kept small so it never becomes the binding term and
 * hides the historical half.
 */
const SPEND: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m, i === 3 || i === 8 ? 9000 : 1800]),
);

function deps(limit: number, held: number): GetReserveFitDeps {
  return {
    overviewRepo: {
      categoryWindows: async () => [
        {
          category_id: CAT,
          name: "Travel",
          created_month: MONTHS[0]!,
          archived_month: null,
          is_investment: false,
        },
      ],
      monthlyPlannedByCategory: async () =>
        MONTHS.map((month) => ({
          category_id: CAT,
          month,
          planned_cents: zl(limit),
        })),
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
        amount_cents: zl(500),
        cadence: "YEARLY" as const,
        yearly_month: 10,
        next_due_date: "2026-10-15",
        currency: "PLN",
      },
    ],
    fxProvider: {
      rateAsOf: async () => ({ rate: "1" }),
    } as unknown as GetReserveFitDeps["fxProvider"],
    exclusionsRepo: { largeTransactions: async () => [] },
    reservePositions: async () =>
      ok({
        positions: new Map([
          [
            CAT,
            {
              categoryId: CAT,
              reserveCents: zl(held),
              usedCents: 0n,
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map(),
            },
          ],
        ]),
        openMonth: "2026-09",
        internalCents: zl(held),
        userDefinedCents: zl(held),
        surplusCents: 0n,
      }) as never,
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    now: () => new Date("2026-09-15T00:00:00Z"),
  };
}

const rowAt = async (limit: number, held: number) => {
  const res = await getReserveFit(deps(limit, held))({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from: "2025-09-01",
    to: "2026-08-31",
  });
  if (res.isErr()) throw res.error;
  return res.value.rows[0]!;
};

describe("what the reserve will need at the suggested limit", () => {
  test("is what it needs once that limit is set", async () => {
    const before = await rowAt(4000, 20000);
    expect(before.suggested_limit_cents).not.toBeNull();
    const suggested = Number(before.suggested_limit_cents) / 100;

    const after = await rowAt(suggested, 20000);
    // The promise and the outcome, side by side.
    expect(after.needed_cents).toBe(before.suggested_needed_cents!);
  });

  test("so the surplus it offers does not turn into a shortfall", async () => {
    const before = await rowAt(4000, 20000);
    const promised =
      Number(before.held_cents) - Number(before.suggested_needed_cents);
    const after = await rowAt(
      Number(before.suggested_limit_cents) / 100,
      20000,
    );
    expect(Number(after.gap_cents)).toBe(promised);
  });

  test("history still asks for more once the limit drops below it", async () => {
    // The fixture is only meaningful if the lower limit really does raise what
    // history wants — otherwise the two tests above would pass on a constant.
    const high = await rowAt(4000, 20000);
    const low = await rowAt(2000, 20000);
    expect(Number(low.needed_cents)).toBeGreaterThan(Number(high.needed_cents));
  });
});
