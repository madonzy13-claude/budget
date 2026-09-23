/**
 * get-reserve-fit-held-follows-limit.test.ts — the suggestion must solve for a
 * reserve that MOVES with the limit (user, 260922).
 *
 * The suggested limit is found by searching for the smallest limit at which
 * "what the buffer needs" is no more than "what the buffer holds". But what it
 * holds is not a constant: the OPEN month draws on the reserve for its
 * overspend, and never accrues until it closes (`reserve-engine.ts`: "the open
 * month has not, and must not"). Raise the limit and less is drawn, so more is
 * held; lower it and more is drawn.
 *
 * Solving `needed(L) = held(L₀)` therefore answers a question that stops being
 * true the moment the member acts on it: the reserve moves, and the next read
 * names a different limit. Car, live on 260922: 8,191 held with 3,086 of it
 * already drawn by September, so 11,277 came into the month.
 *
 * The fix solves `needed(L) = held(L)` instead. Both sides are monotone in
 * opposite directions — needed falls as the limit rises, held rises — so they
 * cross exactly once, and the crossing is a genuine fixed point: set that
 * limit, the month really does draw what the model said, and the next read has
 * nothing to add.
 *
 * Only the running month's DRAW is modelled here. Nothing about a half-finished
 * month is allowed to size the limit — that still comes from closed months and
 * known commitments (see get-reserve-fit-current-limit.test.ts).
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

/** Lumpy, so history asks for a buffer at all. */
const SPEND: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m, i === 3 || i === 8 ? 6000 : 900]),
);

const HIST_LIMIT = 662;
/** What the reserve carried INTO the open month, before it drew anything. */
const CARRIED_IN = 5000;
/** What the open month has spent — the insurance landed in it. */
const OPEN_SPEND = 4826;

/** The engine's open-month rule: draw for overspend, capped at what is there,
 *  and never accrue until the month closes. */
function openCellAt(limit: number) {
  const overage = Math.max(0, OPEN_SPEND - limit);
  const used = Math.min(overage, CARRIED_IN);
  return {
    overage,
    left: Math.max(0, limit - OPEN_SPEND),
    used,
    endReserve: CARRIED_IN - used,
  };
}

function deps(limit: number): GetReserveFitDeps {
  const cell = openCellAt(limit);
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
      monthlyPlannedByCategory: async (
        _budgetId: string,
        from: string,
        to: string,
      ) => {
        const rows = MONTHS.map((month) => ({
          category_id: CAT,
          month,
          planned_cents: zl(HIST_LIMIT),
        }));
        // The running month runs on the limit under test.
        rows.push({
          category_id: CAT,
          month: OPEN_MONTH,
          planned_cents: zl(limit),
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
              reserveCents: zl(cell.endReserve),
              usedCents: zl(cell.used),
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map([
                [
                  OPEN_MONTH,
                  {
                    usedCents: zl(cell.used),
                    overspentCents: 0n,
                    overageCents: zl(cell.overage),
                    leftCents: zl(cell.left),
                    endReserveCents: zl(cell.endReserve),
                  },
                ],
              ]),
            },
          ],
        ]),
        openMonth: OPEN_MONTH,
        internalCents: zl(cell.endReserve),
        userDefinedCents: zl(cell.endReserve),
        surplusCents: 0n,
      }) as never,
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    now: () => new Date("2026-09-22T00:00:00Z"),
  };
}

const rowAt = async (limit: number) => {
  const res = await getReserveFit(deps(limit))({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from: "2025-09-01",
    to: "2026-08-31",
  });
  if (res.isErr()) throw res.error;
  return res.value.rows[0]!;
};

/** Under a whole unit is not a move — the rebalance dialog's own rule. */
const UNIT = 100n;

describe("a suggestion solved against a reserve that moves with the limit", () => {
  test("is a fixed point: acting on it leaves nothing to suggest", async () => {
    const before = await rowAt(900);
    expect(before.suggested_limit_cents).not.toBeNull();
    const suggested = Number(before.suggested_limit_cents) / 100;

    // The member sets exactly what was asked. September now draws what that
    // limit implies, so the reserve lands somewhere new — and the row is read
    // again.
    const after = await rowAt(suggested);

    if (after.suggested_limit_cents === null) return;
    const again = BigInt(after.suggested_limit_cents);
    const asked = BigInt(before.suggested_limit_cents!);
    const moved = again > asked ? again - asked : asked - again;
    expect(moved).toBeLessThan(UNIT);
  });

  test("and what it promises the buffer will need comes true", async () => {
    const before = await rowAt(900);
    const suggested = Number(before.suggested_limit_cents) / 100;
    const after = await rowAt(suggested);
    // The promise on the row, and the outcome once the limit is set.
    expect(after.needed_cents).toBe(before.suggested_needed_cents!);
  });

  test("so the row reads level once the advice is taken", async () => {
    const before = await rowAt(900);
    const suggested = Number(before.suggested_limit_cents) / 100;
    const after = await rowAt(suggested);
    // needed no bigger than held: the whole point of the search.
    expect(BigInt(after.needed_cents)).toBeLessThanOrEqual(
      BigInt(after.held_cents),
    );
  });
});
