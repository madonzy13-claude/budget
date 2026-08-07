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
    scheduled_cadence: null,
    excluded: false,
  },
  {
    ledger_id: "tx-shop",
    category_id: CAT_FOOD,
    transaction_date: "2026-02-03",
    note: "Big shop",
    amount_cents: 18000n,
    scheduled_cadence: null,
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
    activeScheduledPayments: async () => [],
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
        scheduled_cadence: null,
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
              scheduled_cadence: null,
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
  // the active scheduled rules.
  test("sizes for a yearly charge that has not happened yet", async () => {
    const d = deps({
      activeScheduledPayments: async () => [
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
      activeScheduledPayments: async () => [
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

  // "імперія": archived long before the range, no transactions ever, but the
  // engine still carries a reserve balance for it from an old limit. A category
  // that died before the window has nothing to size, and its phantom balance is
  // a Reserves-tab matter, not a sizing one (user, 260804).
  test("drops a category archived before the range, balance or not", async () => {
    const DEAD = "cat-dead";
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return [
            ...windows,
            {
              category_id: DEAD,
              name: "імперія",
              created_month: "2025-01",
              archived_month: "2025-06",
              is_investment: false,
            },
          ];
        },
        async monthlyPlannedByCategory() {
          return [
            ...planned,
            {
              category_id: DEAD,
              month: "2026-01",
              planned_cents: 5000n,
              needs_cents: 5000n,
            },
          ];
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
            ...position(DEAD, 12000n),
          ]),
          openMonth: "2026-03",
          internalCents: 0n,
          userDefinedCents: 0n,
          surplusCents: 0n,
          direction: "NONE" as const,
        }),
    } as never);
    expect(await rowFor(DEAD, d)).toBeUndefined();
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
              // Archived INSIDE the range: its months still count.
              archived_month: "2026-02",
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

  // 260804, user report: Car reads "needs nothing" although a 2,500 insurance
  // renewal lands every September. The walk ran history and future as ONE line,
  // so months of past underspend paid for a charge that has not happened yet —
  // but that surplus is the reserve you ALREADY hold, which is the other side
  // of the comparison. The future has to stand on its own.
  test("a known charge still needs covering, however good the past was", async () => {
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return planned;
        },
        async monthlySpendByCategory() {
          // Food underspends by 3,000 a month — 6,000 banked over the range.
          return [
            { category_id: CAT_FOOD, month: "2026-01", spent_cents: 17000n },
            { category_id: CAT_FOOD, month: "2026-02", spent_cents: 17000n },
            { category_id: CAT_SPORT, month: "2026-01", spent_cents: 18000n },
            { category_id: CAT_SPORT, month: "2026-02", spent_cents: 18000n },
          ];
        },
      },
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 50000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 9,
        },
      ],
    } as never);
    const food = await rowFor(CAT_FOOD, d);
    // September asks 50,000 ON TOP of an ordinary month, so all of it must be
    // there — the 20,000 limit is already spoken for by that month's own spend.
    expect(food?.needed_cents).toBe("50000");
  });

  test("the harder of past and future is what has to be held", async () => {
    const d = deps({
      // History alone demands 12,000 (Feb's overage after January's surplus);
      // the future asks for only 5,000 − 20,000 < 0, i.e. nothing.
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 5000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 9,
        },
      ],
    } as never);
    expect((await rowFor(CAT_FOOD, d))?.needed_cents).toBe("12000");
  });

  test("names the commitments it cannot attribute to any category", async () => {
    const d = deps({
      activeScheduledPayments: async () => [
        {
          category_id: null,
          name: null,
          rule_name: "Car Insurance",
          amount_cents: 250000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 9,
        },
      ],
    } as never);
    const dto = (await getReserveFit(d)(input))._unsafeUnwrap();
    // It cannot size any category's buffer, but the member needs to know it is
    // uncounted — one click in Settings fixes it.
    expect(dto.unassigned_scheduled).toEqual([
      { name: "Car Insurance", amount_cents: "250000" },
    ]);
  });

  test("has nothing to warn about when every rule has a category", async () => {
    const dto = (await getReserveFit(deps())(input))._unsafeUnwrap();
    expect(dto.unassigned_scheduled).toEqual([]);
  });

  // The same rule appears twice over a long window: the charge it already made
  // sits in the range's spend, and its NEXT occurrence sits in the forward year.
  // Those are two separate events a year apart, and the buffer only ever has to
  // cover one of them — so the two walks are compared, never added.
  test("counts a yearly charge once, not once per walk", async () => {
    const CAT = CAT_FOOD;
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return [
            {
              category_id: CAT,
              month: "2026-01",
              planned_cents: 20000n,
              needs_cents: 20000n,
            },
            {
              category_id: CAT,
              month: "2026-02",
              planned_cents: 20000n,
              needs_cents: 20000n,
            },
          ];
        },
        async monthlySpendByCategory() {
          // February already carried the 50,000 charge: 30,000 over its limit.
          return [
            { category_id: CAT, month: "2026-01", spent_cents: 20000n },
            { category_id: CAT, month: "2026-02", spent_cents: 50000n },
          ];
        },
      },
      // …and the same rule fires again next February.
      activeScheduledPayments: async () => [
        {
          category_id: CAT,
          name: "Food",
          amount_cents: 50000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 2,
        },
      ],
    } as never);
    const row = await rowFor(CAT, d);
    // History asked 30,000 (the charge less the limit it consumed); next
    // February asks 50,000 on top of an ordinary month. The harder of the two
    // stands — NOT the 80,000 the two would make if they were added.
    expect(row?.needed_cents).toBe("50000");
  });

  // A yearly charge lands ON TOP of the month's plan, not inside it: the limit
  // is what the category spends in an ordinary month, and September still has
  // its ordinary fuel and parking. Sizing the buffer at "charge − limit" left
  // exactly the charge covered and everything else that month uncovered — which
  // is the thing the member said they would be caught by (user, 260804).
  test("a yearly charge sits on top of the month's plan", async () => {
    const d = deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 50000n,
          currency: "PLN",
          cadence: "YEARLY",
          yearly_month: 9,
        },
      ],
    } as never);
    // The whole 50,000, not 50,000 − the 20,000 limit.
    expect((await rowFor(CAT_FOOD, d))?.needed_cents).toBe("50000");
  });

  // A monthly rule is what the limit was set for. Treating it as extra would
  // grow the "needed" figure every month, forever.
  test("a monthly rule stays inside the plan it was budgeted in", async () => {
    const d = deps({
      activeScheduledPayments: async () => [
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
    // History alone still decides: February's 15,000 overage less January's
    // 3,000 surplus.
    expect((await rowFor(CAT_FOOD, d))?.needed_cents).toBe("12000");
  });

  test("a monthly rule bigger than the whole limit still counts its excess", async () => {
    const d = deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          name: "Food",
          amount_cents: 26000n,
          currency: "PLN",
          cadence: "MONTHLY",
          yearly_month: null,
        },
      ],
    } as never);
    // 26,000 committed every month against a 20,000 limit: 6,000 a month of
    // hole, and the walk deepens with each one.
    expect(Number((await rowFor(CAT_FOOD, d))?.needed_cents)).toBeGreaterThan(
      12000,
    );
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

describe("getReserveFit — the limit it judges history against", () => {
  // A buffer is held for what comes NEXT, and what comes next is metered by the
  // limit in force today. Judging history against the limits that have since
  // been retired quoted a buffer for a budget nobody runs any more: Food & Home
  // sat at 50/month all year, spent like 110, and the chart asked for 662 —
  // against the 110 the household had already moved to, the same months ask for
  // nothing (user, 260807).
  const raisedToday = [
    ...planned,
    {
      category_id: CAT_FOOD,
      month: "2026-03",
      planned_cents: 40000n,
      needs_cents: 40000n,
    },
  ];

  const raisedDeps = () =>
    deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return raisedToday;
        },
        async monthlySpendByCategory() {
          return spend;
        },
      },
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);

  test("walks the past at TODAY's limit, not the one each month had", async () => {
    // Same two months (17000 then 35000). At the old 20000 they trough at
    // −12000; at today's 40000 neither month goes over at all.
    const food = await rowFor(CAT_FOOD, raisedDeps());
    expect(food?.needed_cents).toBe("0");
    expect(food?.held_cents).toBe("5000");
    expect(food?.gap_cents).toBe("5000");
  });

  test("a raised limit unmakes the overage months it was raised past", async () => {
    const food = await rowFor(CAT_FOOD, raisedDeps());
    expect(food?.overage_months).toBe(0);
    expect(food?.worst_month).toBeNull();
    expect(food?.worst_overage_cents).toBe("0");
  });

  test("still counts the months, so thin history stays visible", async () => {
    const food = await rowFor(CAT_FOOD, raisedDeps());
    expect(food?.months_counted).toBe(2);
  });
});

describe("getReserveFit — a range that ends before today", () => {
  // A past window has no running month to read a current limit from, so the
  // latest limit the range itself saw stands in. Still ONE limit for the whole
  // walk: mixing a month's own retired limit with a later one is the thing this
  // is trying to stop.
  const climbing = [
    {
      category_id: CAT_FOOD,
      month: "2026-01",
      planned_cents: 10000n,
      needs_cents: 10000n,
    },
    {
      category_id: CAT_FOOD,
      month: "2026-02",
      planned_cents: 30000n,
      needs_cents: 30000n,
    },
  ];

  test("falls back to the last limit the range saw, for every month", async () => {
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return climbing;
        },
        async monthlySpendByCategory() {
          return spend;
        },
      },
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);
    // At 30000 throughout: Jan banks 13000, Feb goes 5000 over → never troughs.
    // Per-month (10000 then 30000) it would have troughed at 7000 in January.
    const food = await rowFor(CAT_FOOD, d);
    expect(food?.needed_cents).toBe("0");
    expect(food?.overage_months).toBe(1);
    expect(food?.worst_month).toBe("2026-02");
  });
});

describe("getReserveFit — a one-time payment ahead", () => {
  // The household's own words (260807): one-time payments must be included in
  // the reserve sizing. A sofa bought in three months is the same problem a
  // yearly renewal is — money that has to be there before the month arrives —
  // so it sizes the buffer even though history has never seen it.
  const sofaDeps = () =>
    deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          amount_cents: 300000n,
          cadence: "ONCE" as const,
          yearly_month: null,
          next_due_date: "2026-06-20",
        },
      ],
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);

  test("sizes the buffer for a payment history has never seen", async () => {
    // History alone asks for 12000. The sofa is 300000 landing on an ordinary
    // month, and the harder of the two walks is what must be held.
    const food = await rowFor(CAT_FOOD, sofaDeps());
    expect(food?.needed_cents).toBe("300000");
  });

  test("held is unchanged — this moves the target, not the money", async () => {
    const food = await rowFor(CAT_FOOD, sofaDeps());
    expect(food?.held_cents).toBe("5000");
    expect(food?.gap_cents).toBe("-295000");
  });
});

describe("getReserveFit — how far the forward walk looks", () => {
  // It looked exactly twelve months, which was right when everything had a
  // rhythm: a year catches every annual renewal once. A one-time payment can
  // sit further out than that, and a buffer that never sees it is sized wrong
  // (260807). The window now runs to the furthest thing scheduled.
  const farSofa = () =>
    deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          amount_cents: 300000n,
          cadence: "ONCE" as const,
          yearly_month: null,
          next_due_date: "2027-11-20", // ~20 months out
        },
      ],
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);

  test("reaches a one-time payment beyond a year", async () => {
    const food = await rowFor(CAT_FOOD, farSofa());
    expect(food?.needed_cents).toBe("300000");
  });

  test("still covers a year when nothing is scheduled further out", async () => {
    // No regression for the ordinary case: a yearly renewal inside the next
    // twelve months is still reserved for.
    const d = deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          amount_cents: 250000n,
          cadence: "YEARLY" as const,
          yearly_month: 9,
          next_due_date: "2026-09-12",
        },
      ],
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);
    const food = await rowFor(CAT_FOOD, d);
    expect(food?.needed_cents).toBe("250000");
  });
});

describe("getReserveFit — the limit that would fund the buffer", () => {
  // Food's two months: 20000 limit, 17000 then 35000 spent, 5000 held. Mean
  // spend is 26000 against a 20000 limit, so the category cannot accrue a cent
  // today and "top up 7000 now" would drain straight back out.
  //
  // Ordinary spending is 26000 a month and nothing is scheduled, so the limit
  // starts there — a limit under what a category spends is a standing
  // overspend. On top of it, history's 12000 trough less the 5000 held is 7000
  // to find, spread across the twelve-month runway: 584 a month.
  test("spreads what history asks for across the whole runway", async () => {
    const food = await rowFor(CAT_FOOD);
    expect(food?.suggested_limit_cents).toBe("26584");
    expect(food?.suggested_delta_cents).toBe("6584");
    expect(food?.suggested_direction).toBe("raise");
    expect(food?.suggested_over_months).toBe(12);
  });

  test("says nothing when today's limit is already the smallest sufficient one", async () => {
    // Sport holds 460000 against a jump it can absorb — there is no better
    // limit to name, and a suggestion that changes nothing is noise.
    const d = deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return planned.map((p) =>
            p.category_id === CAT_SPORT ? { ...p, planned_cents: 26000n } : p,
          );
        },
        async monthlySpendByCategory() {
          return spend.map((s) =>
            s.category_id === CAT_SPORT
              ? { ...s, spent_cents: s.month === "2026-01" ? 17000n : 35000n }
              : s,
          );
        },
      },
      reservePositions: async () =>
        ok({
          positions: new Map([
            ...position(CAT_SPORT, 5000n),
            ...position(CAT_FOOD, 5000n),
          ]),
          openMonth: "2026-03",
          internalCents: 0n,
          userDefinedCents: 0n,
          surplusCents: 0n,
          direction: "NONE" as const,
        }) as unknown as Result<never, Error>,
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);
    const sport = await rowFor(CAT_SPORT, d);
    expect(sport?.suggested_limit_cents).toBeNull();
  });

  test("a lump ahead has to be funded before it lands, so it asks for more", async () => {
    // 50000 due in three months has only three months of runway behind it,
    // which is a harder ask per month than the same sum a year out — the
    // tightest month sets the limit (user, 260807).
    const withLump = deps({
      activeScheduledPayments: async () => [
        {
          category_id: CAT_FOOD,
          amount_cents: 50000n,
          cadence: "ONCE" as const,
          yearly_month: null,
          next_due_date: "2026-05-20",
        },
      ],
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);
    const withLumpRow = await rowFor(CAT_FOOD, withLump);
    const plain = await rowFor(CAT_FOOD);
    expect(
      BigInt(withLumpRow!.suggested_limit_cents!),
    ).toBeGreaterThan(BigInt(plain!.suggested_limit_cents!));
  });
});

describe("getReserveFit — never advise off a half-finished month", () => {
  // The default Overview range is THIS MONTH, and with no closed month the walk
  // falls back to the running one: a weak signal beats none for SIZING. For a
  // SUGGESTION it is not weak, it is wrong — on the 7th a 3,000/month category
  // reads as spending 700, and the advice becomes "cut the limit to 700 and
  // free 2,300", every month, on the screen people open first (audit, 260807).
  const runningMonthOnly = () =>
    deps({
      overviewRepo: {
        async categoryWindows() {
          return windows;
        },
        async monthlyPlannedByCategory() {
          return [
            {
              category_id: CAT_FOOD,
              month: "2026-03",
              planned_cents: 300000n,
              needs_cents: 300000n,
            },
          ];
        },
        async monthlySpendByCategory() {
          // Seven days in: a fraction of what the month will really cost.
          return [
            { category_id: CAT_FOOD, month: "2026-03", spent_cents: 70000n },
          ];
        },
      },
    } as unknown as Partial<Parameters<typeof getReserveFit>[0]>);

  test("offers no limit suggestion when every month is still running", async () => {
    const food = await rowFor(CAT_FOOD, runningMonthOnly());
    expect(food?.suggested_limit_cents).toBeNull();
    expect(food?.suggested_direction).toBeNull();
  });

  test("still sizes the reserve from it — that part was only ever a weak signal", async () => {
    const food = await rowFor(CAT_FOOD, runningMonthOnly());
    expect(food).toBeDefined();
    expect(food?.months_counted).toBe(1);
  });
});
