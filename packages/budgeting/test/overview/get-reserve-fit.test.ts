/**
 * get-reserve-fit.test.ts — the per-category reserve sizing read model.
 *
 * Puts three sources together: the limit in force each month, the spend against
 * it (net of one-offs the budget has excluded), and the reserve the category
 * holds NOW. Output is one row per category: held vs needed, plus the large
 * transactions the member can tick off as one-offs.
 */
import { describe, test, expect } from "bun:test";
import { ok, type Result } from "@budget/shared-kernel";
import { getReserveFit } from "../../src/application/get-reserve-fit";

const position = (id: string, reserveCents: bigint) =>
  [
    [
      id,
      {
        categoryId: id,
        reserveCents,
        usedCents: 0n,
        overspentCents: 0n,
        reserveExcluded: false,
        byMonth: new Map(),
      },
    ],
  ] as const;

const CAT_FOOD = "cat-food";
const CAT_SPORT = "cat-sport";

const windows = [
  {
    category_id: CAT_FOOD,
    name: "Food",
    created_month: "2025-01",
    archived_month: null,
    is_investment: false,
  },
  {
    category_id: CAT_SPORT,
    name: "Sport",
    created_month: "2025-01",
    archived_month: null,
    is_investment: false,
  },
];

const planned = [
  {
    category_id: CAT_FOOD,
    month: "2026-01",
    planned_cents: 20000n,
    needs_cents: 20000n,
  },
  {
    category_id: CAT_FOOD,
    month: "2026-02",
    planned_cents: 20000n,
    needs_cents: 20000n,
  },
  {
    category_id: CAT_SPORT,
    month: "2026-01",
    planned_cents: 20000n,
    needs_cents: 20000n,
  },
  {
    category_id: CAT_SPORT,
    month: "2026-02",
    planned_cents: 20000n,
    needs_cents: 20000n,
  },
];

const spend = [
  { category_id: CAT_FOOD, month: "2026-01", spent_cents: 17000n },
  { category_id: CAT_FOOD, month: "2026-02", spent_cents: 35000n },
  { category_id: CAT_SPORT, month: "2026-01", spent_cents: 18000n },
  { category_id: CAT_SPORT, month: "2026-02", spent_cents: 500000n },
];

/** Sport's jump; Food's big grocery run. */
const largeTxns = [
  {
    ledger_id: "tx-jump",
    category_id: CAT_SPORT,
    transaction_date: "2026-02-14",
    note: "Parachute jump",
    amount_cents: 480000n,
    recurring_cadence: null,
    excluded: false,
  },
  {
    ledger_id: "tx-shop",
    category_id: CAT_FOOD,
    transaction_date: "2026-02-03",
    note: "Big shop",
    amount_cents: 18000n,
    recurring_cadence: null,
    excluded: false,
  },
];

function deps(over: Partial<Parameters<typeof getReserveFit>[0]> = {}) {
  return {
    overviewRepo: {
      async categoryWindows() {
        return windows;
      },
      async monthlyPlannedByCategory() {
        return planned;
      },
      async monthlySpendByCategory() {
        return spend;
      },
    },
    exclusionsRepo: {
      async largeTransactions() {
        return largeTxns;
      },
    },
    activeRecurringRules: async () => [],
    // After the range: both months are closed, so the walk counts both. Tests
    // that care about the running month set their own `now`.
    now: () => new Date("2026-03-05T12:00:00Z"),
    reservePositions: async () =>
      ok({
        positions: new Map([
          [
            CAT_FOOD,
            {
              categoryId: CAT_FOOD,
              reserveCents: 5000n,
              usedCents: 0n,
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map(),
            },
          ],
          [
            CAT_SPORT,
            {
              categoryId: CAT_SPORT,
              reserveCents: 460000n,
              usedCents: 0n,
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: new Map(),
            },
          ],
        ]),
        openMonth: "2026-03",
        internalCents: 0n,
        userDefinedCents: 0n,
        surplusCents: 0n,
        direction: "NONE" as const,
      }) as unknown as Result<never, Error>,
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "PLN" };
      },
    },
    ...over,
  } as Parameters<typeof getReserveFit>[0];
}

const input = {
  tenantId: "b1",
  budgetId: "b1",
  from: "2026-01-01",
  to: "2026-02-28",
};

const rowFor = async (id: string, d = deps()) => {
  const dto = (await getReserveFit(d)(input))._unsafeUnwrap();
  return dto.rows.find((r) => r.category_id === id);
};

describe("getReserveFit", () => {
  test("sizes each category on the deepest trough of its own history", async () => {
    // Food banks 3000 in January, then goes 15000 over → 12000 had to be held.
    const food = await rowFor(CAT_FOOD);
    expect(food?.needed_cents).toBe("12000");
    expect(food?.held_cents).toBe("5000");
    // held − needed: short by 7000.
    expect(food?.gap_cents).toBe("-7000");
  });

  test("reports the worst month so the number is auditable", async () => {
    const sport = await rowFor(CAT_SPORT);
    expect(sport?.worst_month).toBe("2026-02");
    expect(sport?.worst_overage_cents).toBe("480000");
  });

  test("excluding a one-off transaction shrinks what the history asks for", async () => {
    const d = deps({
      exclusionsRepo: {
        async largeTransactions() {
          return largeTxns.map((t) =>
            t.ledger_id === "tx-jump" ? { ...t, excluded: true } : t,
          );
        },
      },
    } as never);
    const sport = await rowFor(CAT_SPORT, d);
    // 500000 − 480000 = 20000 spent, exactly its limit → nothing needed, and the
    // 460000 it holds is all trimmable.
    expect(sport?.needed_cents).toBe("0");
    expect(sport?.gap_cents).toBe("460000");
  });

  test("hands back the large transactions with their tick state", async () => {
    const sport = await rowFor(CAT_SPORT);
    expect(sport?.large_transactions).toEqual([
      {
        ledger_id: "tx-jump",
        transaction_date: "2026-02-14",
        note: "Parachute jump",
        amount_cents: "480000",
        recurring_cadence: null,
        excluded: false,
      },
    ]);
  });

  test("keeps trivia off the list — only spend that could move the number", async () => {
    // A 30 zł coffee cannot be why a 200 zł/month category needs a buffer, and
    // listing it just erodes trust in the ones that matter.
    const d = deps({
      exclusionsRepo: {
        async largeTransactions() {
          return [
            ...largeTxns,
            {
              ledger_id: "tx-coffee",
              category_id: CAT_FOOD,
              transaction_date: "2026-01-09",
              note: "Coffee",
              amount_cents: 3000n,
              recurring_cadence: null,
              excluded: false,
            },
          ];
        },
      },
    } as never);
    const food = await rowFor(CAT_FOOD, d);
    expect(food?.large_transactions.map((t) => t.ledger_id)).toEqual([
      "tx-shop",
    ]);
  });

  // A charge you KNOW is coming has to be reserved for, even when the range
  // never covered one (user, 260804). The walk gains a forward leg built from
  // the active recurring rules.
  test("sizes for a yearly charge that has not happened yet", async () => {
    const d = deps({
      activeRecurringRules: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 300000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 9,
        },
      ],
    } as never);
    const food = await rowFor(CAT_FOOD, d);
    // History alone asked for 12000. September then lands 300000 against a
    // 20000 limit while the walk has been refilling 3000 a month since March —
    // the trough deepens instead of resetting.
    expect(Number(food?.needed_cents)).toBeGreaterThan(12000);
    expect(Number(food?.needed_cents)).toBeGreaterThan(260000);
  });

  test("a monthly rule inside its own limit does not deepen the trough", async () => {
    const d = deps({
      activeRecurringRules: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 5000n,
          currency: "PLN",
          cadence: "MONTHLY",
          yearly_month: null,
        },
      ],
    } as never);
    const food = await rowFor(CAT_FOOD, d);
    // 5000 a month against a 20000 limit leaves the buffer refilling, so the
    // deepest point is still February's.
    expect(food?.needed_cents).toBe("12000");
  });

  // "ымо", "імперія" — archived test categories with no spend, no limit and no
  // reserve, listed at 0% and meaning nothing (user, 260804).
  test("drops a category with no history, no commitment and no reserve", async () => {
    const GHOST = "cat-ghost";
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return [
            ...windows,
            {
              category_id: GHOST,
              name: "ымо",
              created_month: "2026-07",
              archived_month: "2026-07",
              is_investment: false,
            },
          ];
        },
        async monthlyPlannedByCategory() {
          return planned;
        },
        async monthlySpendByCategory() {
          return spend;
        },
      },
      reservePositions: async () =>
        ok({
          positions: new Map([
            ...position(CAT_FOOD, 5000n),
            ...position(CAT_SPORT, 460000n),
            ...position(GHOST, 0n),
          ]),
          openMonth: "2026-03",
          internalCents: 0n,
          userDefinedCents: 0n,
          surplusCents: 0n,
          direction: "NONE" as const,
        }),
    } as never);
    expect(await rowFor(GHOST, d)).toBeUndefined();
    expect(await rowFor(CAT_FOOD, d)).toBeDefined();
  });

  test("keeps a dead category that still holds money — it can be freed", async () => {
    const GHOST = "cat-ghost";
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return [
            ...windows,
            {
              category_id: GHOST,
              name: "Old hobby",
              created_month: "2025-01",
              archived_month: "2025-12",
              is_investment: false,
            },
          ];
        },
        async monthlyPlannedByCategory() {
          return planned;
        },
        async monthlySpendByCategory() {
          return spend;
        },
      },
      reservePositions: async () =>
        ok({
          positions: new Map([
            ...position(CAT_FOOD, 5000n),
            ...position(CAT_SPORT, 460000n),
            ...position(GHOST, 33000n),
          ]),
          openMonth: "2026-03",
          internalCents: 0n,
          userDefinedCents: 0n,
          surplusCents: 0n,
          direction: "NONE" as const,
        }),
    } as never);
    const ghost = await rowFor(GHOST, d);
    expect(ghost?.needed_cents).toBe("0");
    expect(ghost?.gap_cents).toBe("33000");
  });

  // The month still running is half a month of spend against a whole month of
  // limit, so it fakes a surplus that refills the walk. Both Overview charts now
  // leave it out and say so underneath (user, 260804).
  test("leaves the month still running out of the walk", async () => {
    const d = deps({
      // now sits INSIDE the range's last month
      now: () => new Date("2026-02-10T12:00:00Z"),
    } as never);
    const food = await rowFor(CAT_FOOD, d);
    // Only January counts: 20000 planned against 17000 spent → never short.
    expect(food?.needed_cents).toBe("0");
    expect(food?.months_counted).toBe(1);
  });

  test("keeps the running month when it is all the history there is", async () => {
    const d = deps({ now: () => new Date("2026-01-20T12:00:00Z") } as never);
    const dto = (
      await getReserveFit(d)({
        tenantId: "b1",
        budgetId: "b1",
        from: "2026-01-01",
        to: "2026-01-31",
      })
    )._unsafeUnwrap();
    expect(
      dto.rows.find((r) => r.category_id === CAT_FOOD)?.months_counted,
    ).toBe(1);
  });

  test("leaves reserve-excluded categories out entirely", async () => {
    const d = deps({
      reservePositions: async () =>
        ok({
          positions: new Map([
            [
              CAT_FOOD,
              {
                categoryId: CAT_FOOD,
                reserveCents: 5000n,
                usedCents: 0n,
                overspentCents: 0n,
                reserveExcluded: true,
                byMonth: new Map(),
              },
            ],
          ]),
          openMonth: "2026-03",
          internalCents: 0n,
          userDefinedCents: 0n,
          surplusCents: 0n,
          direction: "NONE" as const,
        }),
    } as never);
    expect(await rowFor(CAT_FOOD, d)).toBeUndefined();
  });

  test("says how much history a row rests on", async () => {
    const dto = (await getReserveFit(deps())(input))._unsafeUnwrap();
    expect(dto.currency).toBe("PLN");
    expect(dto.rows[0]?.months_counted).toBe(2);
  });
});
