# Cash-Flow Projection Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width "cash-flow projection" banner to the Overview tab that simulates today → end of next month day-by-day and colors each day green/yellow/red by whether the user can cover planned spending, with income/bill markers and a scrubber tooltip.

**Architecture:** A pure domain simulator (`simulateCashflow`, no IO — golden-fixture tested) is fed by an impure loader (`computeCashflowProjection`: raw SQL + FX + the existing `reservePositions` seam), exposed as `deps.budgeting.getCashflowProjection` and served at `GET /budgets/:id/overview/projection`. The web side is a client island (`projection-timeline.tsx`) driven by a React Query hook, mounted in `overview-tab.tsx` between the cards and the collapsible sections.

**Tech Stack:** Bun + TypeScript, Drizzle raw SQL over `withTenantTx`, `temporal-polyfill`, Hono route, Next.js client island, TanStack Query, next-intl (EN/PL/UK), bun:test / Vitest+RTL / Playwright-BDD.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-cashflow-projection-timeline-design.md`.
- Money is `bigint` cents in domain/app; `bigint → string` only at the route boundary.
- Drizzle/SQL lives ONLY in `packages/budgeting/src/adapters/persistence/` and application-layer raw-SQL loaders (existing pattern: `compute-upcoming-by-category.ts`, `recompute-income-under-planned-task.ts`). Domain entities have no Drizzle import.
- Window: start = today (`Temporal.Now.plainDateISO()`), end = last day of next month. Reuse `nextOccurrence` from `packages/budgeting/src/domain/cadence.ts` and `sumWalletsToCurrency` from `packages/budgeting/src/application/compute-budget-wealth-now.ts`.
- `cushion_mode_enabled` (per-month mode) decides both spendable wallet types (SPENDINGS + CUSHION) and the active category budget (cushion vs normal). RESERVE wallets are never spendable cash.
- Reserve buffer = Σ per-category `reserveCents` from `deps.budgeting.reservePositions` — a single pool, consumed once (RESERVE wallet balances are NOT added on top).
- `MAX_PROJECTION_STEPS = 400` backstop on every cadence enumeration loop.
- i18n keys in EN + PL + UK, namespace `bdp.tab.overview.projection`.
- TDD: red → green → refactor; commit each task. Run `bun test` (backend) / `cd apps/web && bun run test` (Vitest) yourself before asking the user to click anything.

---

## File Structure

- Create `packages/budgeting/src/application/simulate-cashflow-projection.ts` — pure simulator + types.
- Create `packages/budgeting/test/application/simulate-cashflow-projection.test.ts` — golden fixtures.
- Create `packages/budgeting/src/application/compute-cashflow-projection.ts` — impure loader + `enumerateOccurrences` helper.
- Create `packages/budgeting/test/application/enumerate-occurrences.test.ts` — helper tests.
- Modify `packages/budgeting/package.json` — export the two new subpaths.
- Create `apps/api/src/routes/overview-projection.ts` — `GET /:id/overview/projection`.
- Modify `apps/api/src/boot.ts` — construct + expose `getCashflowProjection`.
- Modify `apps/api/src/routes/budgets.ts` — register the route.
- Create `apps/api/test/routes/overview-projection.test.ts` — route integration test.
- Create `apps/web/src/hooks/use-projection.ts` — RQ hook + DTO type.
- Create `apps/web/src/components/budgeting/overview/projection-timeline.tsx` — banner (band + headline + scrubber tooltip).
- Create `apps/web/test/projection-timeline.test.tsx` — component tests.
- Modify `apps/web/src/components/budgeting/overview/overview-tab.tsx` — mount the banner.
- Modify `apps/web/messages/{en,pl,uk}.json` — projection strings.
- Create `apps/web/e2e/features/overview-projection.feature` + `apps/web/e2e/page-objects/ProjectionTimelinePo.ts` + step wiring.

---

## Task 1: Pure cash-flow simulator

**Files:**

- Create: `packages/budgeting/src/application/simulate-cashflow-projection.ts`
- Test: `packages/budgeting/test/application/simulate-cashflow-projection.test.ts`

**Interfaces:**

- Produces: `simulateCashflow(input: CashflowSimInput): CashflowProjection`, plus exported types `CashflowSimInput`, `CashflowCategoryInput`, `CashflowEvent`, `CashflowProjection`, `DayCell`, `DayColor`, `DayReserveDraw`.

- [ ] **Step 1: Write the failing test file**

```ts
// packages/budgeting/test/application/simulate-cashflow-projection.test.ts
import { describe, test, expect } from "bun:test";
import {
  simulateCashflow,
  type CashflowSimInput,
} from "@budget/budgeting/src/application/simulate-cashflow-projection";

/** Minimal July-15 → Aug-31 window, USD, one category, no events. */
function base(overrides: Partial<CashflowSimInput> = {}): CashflowSimInput {
  return {
    today: "2026-07-15",
    windowEnd: "2026-08-31",
    currency: "USD",
    startCashCents: 100_000n,
    categories: [
      {
        id: "cat-food",
        name: "Food",
        budgetThisMonthCents: 30_000n,
        budgetNextMonthCents: 30_000n,
        spentSoFarCents: 0n,
        reserveCents: 0n,
      },
    ],
    incomePayments: [],
    bills: [],
    ...overrides,
  };
}

const colorOn = (p: ReturnType<typeof simulateCashflow>, date: string) =>
  p.days.find((d) => d.date === date)?.color;

describe("simulateCashflow", () => {
  test("plenty of cash, spend within plan → all green", () => {
    const p = simulateCashflow(base());
    expect(p.days[0]!.date).toBe("2026-07-15");
    expect(p.days.at(-1)!.date).toBe("2026-08-31");
    expect(p.days.every((d) => d.color === "green")).toBe(true);
    expect(p.summary.firstRedDate).toBeNull();
  });

  test("no income, cash drains below zero → red once underwater", () => {
    // Big daily discretionary, tiny cash, no income → goes red.
    const p = simulateCashflow(
      base({
        startCashCents: 5_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 300_000n,
            budgetNextMonthCents: 300_000n,
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
      }),
    );
    expect(p.summary.firstRedDate).not.toBeNull();
    expect(colorOn(p, "2026-08-31")).toBe("red");
    expect(p.summary.worstShortfallCents).toBeGreaterThan(0n);
  });

  test("cash dips then a paycheck lands → recovers to green (heat band)", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 0n,
        // rent bill on the 20th drives cash negative; salary on the 25th refills.
        categories: [
          {
            id: "c",
            name: "Rent",
            budgetThisMonthCents: 0n,
            budgetNextMonthCents: 0n,
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Rent",
            categoryId: "c",
            amountCents: 50_000n,
          },
        ],
        incomePayments: [
          { date: "2026-07-25", name: "Salary", amountCents: 200_000n },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-21")).toBe("red"); // underwater, no reserve
    expect(colorOn(p, "2026-07-26")).toBe("green"); // salary landed
  });

  test("overspend a category, reserve absorbs it → yellow, sticky within month, resets next month", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n, // cash never the problem
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 10_000n,
            budgetNextMonthCents: 10_000n,
            spentSoFarCents: 0n,
            reserveCents: 100_000n, // deep reserve
          },
        ],
        // one big bill that blows July's 10k plan but is well within reserve
        bills: [
          {
            date: "2026-07-20",
            name: "Feast",
            categoryId: "c",
            amountCents: 40_000n,
          },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-19")).toBe("green");
    expect(colorOn(p, "2026-07-20")).toBe("yellow"); // reserve tapped
    expect(colorOn(p, "2026-07-31")).toBe("yellow"); // sticky rest of month
    expect(colorOn(p, "2026-08-01")).toBe("green"); // budget lens resets
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.drewReserve.some((r) => r.categoryId === "c")).toBe(true);
  });

  test("overspend beyond reserve → red with per-category shortfall", () => {
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 10_000n,
            budgetNextMonthCents: 10_000n,
            spentSoFarCents: 0n,
            reserveCents: 5_000n, // shallow reserve
          },
        ],
        bills: [
          {
            date: "2026-07-20",
            name: "Feast",
            categoryId: "c",
            amountCents: 40_000n,
          },
        ],
      }),
    );
    expect(colorOn(p, "2026-07-20")).toBe("red");
    const d20 = p.days.find((d) => d.date === "2026-07-20")!;
    expect(d20.shortfall.some((s) => s.categoryId === "c")).toBe(true);
  });

  test("month boundary accrues unspent budget into reserve", () => {
    // July heavily underspent → leftover accrues to reserve, rescuing an Aug overspend.
    const p = simulateCashflow(
      base({
        startCashCents: 1_000_000n,
        categories: [
          {
            id: "c",
            name: "Food",
            budgetThisMonthCents: 100_000n, // July plan, spend ~0 discretionary via bills-only
            budgetNextMonthCents: 10_000n, // Aug plan tiny
            spentSoFarCents: 0n,
            reserveCents: 0n,
          },
        ],
        // No July bills and no July discretionary (budget spread but leftover accrues at close).
        bills: [
          {
            date: "2026-08-15",
            name: "Feast",
            categoryId: "c",
            amountCents: 30_000n,
          },
        ],
      }),
    );
    // Aug 15 overspends Aug's 10k plan by ~20k but July's accrued reserve covers it → yellow not red.
    expect(colorOn(p, "2026-08-15")).not.toBe("red");
  });

  test("empty budget: no categories, no events → flat green", () => {
    const p = simulateCashflow(base({ categories: [], startCashCents: 0n }));
    expect(p.days.every((d) => d.color === "green")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /home/claude/budget && bun test packages/budgeting/test/application/simulate-cashflow-projection.test.ts`
Expected: FAIL — `Cannot find module '.../simulate-cashflow-projection'`.

- [ ] **Step 3: Implement the pure simulator**

```ts
// packages/budgeting/src/application/simulate-cashflow-projection.ts
/**
 * simulate-cashflow-projection.ts — PURE forward cash-flow simulation for the
 * Overview projection timeline. No IO, no FX, no `Temporal.Now`: `today` and all
 * amounts (already FX'd to the budget currency by the loader) are passed in, so the
 * whole thing is golden-fixture testable. Walks each day from `today` to
 * `windowEnd`, draining a single cash pool by dated bills + an even discretionary
 * burn, refilling on income, and tapping per-category reserve when a category's
 * cumulative month spend passes its plan. Each day is coloured by the WORSE of two
 * lenses: liquidity (cash vs reserve pool) and budget (per-category plan vs reserve).
 * See docs/superpowers/specs/2026-07-07-cashflow-projection-timeline-design.md.
 */
import { Temporal } from "temporal-polyfill";

export type DayColor = "green" | "yellow" | "red";

export interface CashflowCategoryInput {
  id: string;
  name: string;
  /** Active budget (cushion vs normal, picked by the loader) for the current month. */
  budgetThisMonthCents: bigint;
  /** Active budget for next month. */
  budgetNextMonthCents: bigint;
  /** Confirmed spend so far this month (before today). */
  spentSoFarCents: bigint;
  /** Available per-category reserve R now. */
  reserveCents: bigint;
}

export interface CashflowEvent {
  date: string; // YYYY-MM-DD
  name: string;
  amountCents: bigint; // budget currency
  categoryId?: string | null;
}

export interface DayReserveDraw {
  categoryId: string;
  name: string;
  amountCents: bigint;
}

export interface DayCell {
  date: string;
  color: DayColor;
  availableCents: bigint; // cash end-of-day
  drewReserve: DayReserveDraw[];
  shortfall: DayReserveDraw[];
  incomeCents: bigint; // income landing that day
  billCents: bigint; // dated bills landing that day
}

export interface CashflowProjection {
  currency: string;
  days: DayCell[];
  incomePoints: { date: string; name: string; amountCents: bigint }[];
  billPoints: {
    date: string;
    name: string;
    categoryId: string | null;
    amountCents: bigint;
  }[];
  summary: {
    firstYellowDate: string | null;
    firstRedDate: string | null;
    worstShortfallCents: bigint; // deepest (cash+reserve) deficit; 0 if never red
  };
}

export interface CashflowSimInput {
  today: string;
  windowEnd: string;
  currency: string;
  startCashCents: bigint;
  categories: CashflowCategoryInput[];
  incomePayments: CashflowEvent[];
  bills: CashflowEvent[];
}

const rank: Record<DayColor, number> = { green: 0, yellow: 1, red: 2 };
const worse = (a: DayColor, b: DayColor): DayColor =>
  rank[a] >= rank[b] ? a : b;

export function simulateCashflow(input: CashflowSimInput): CashflowProjection {
  const start = Temporal.PlainDate.from(input.today);
  const end = Temporal.PlainDate.from(input.windowEnd);
  const startMonth = start.month;
  const startYearMonth = `${start.year}-${start.month}`;

  // Group events by date for O(1) daily lookup.
  const incomeByDate = new Map<string, bigint>();
  for (const e of input.incomePayments)
    incomeByDate.set(e.date, (incomeByDate.get(e.date) ?? 0n) + e.amountCents);
  const billsByDate = new Map<string, CashflowEvent[]>();
  for (const e of input.bills) {
    const arr = billsByDate.get(e.date) ?? [];
    arr.push(e);
    billsByDate.set(e.date, arr);
  }
  const billTotalByDate = new Map<string, bigint>();
  for (const e of input.bills)
    billTotalByDate.set(
      e.date,
      (billTotalByDate.get(e.date) ?? 0n) + e.amountCents,
    );

  // Per-category bill totals split by month (this vs next) for the discretionary burn.
  const nameById = new Map(input.categories.map((c) => [c.id, c.name]));
  const billThisMonth = new Map<string, bigint>();
  const billNextMonth = new Map<string, bigint>();
  for (const e of input.bills) {
    if (!e.categoryId) continue;
    const m = Temporal.PlainDate.from(e.date).month;
    const bucket = m === startMonth ? billThisMonth : billNextMonth;
    bucket.set(e.categoryId, (bucket.get(e.categoryId) ?? 0n) + e.amountCents);
  }

  // Even discretionary daily burn per category, this month and next.
  const daysLeftThisMonth =
    start.with({ day: start.daysInMonth }).day - start.day + 1;
  const nextMonthStart = start.with({ day: 1 }).add({ months: 1 });
  const daysInNextMonth = nextMonthStart.daysInMonth;
  const burnThis = new Map<string, bigint>();
  const burnNext = new Map<string, bigint>();
  for (const c of input.categories) {
    const discThis =
      c.budgetThisMonthCents -
      c.spentSoFarCents -
      (billThisMonth.get(c.id) ?? 0n);
    burnThis.set(
      c.id,
      discThis > 0n ? discThis / BigInt(Math.max(daysLeftThisMonth, 1)) : 0n,
    );
    const discNext = c.budgetNextMonthCents - (billNextMonth.get(c.id) ?? 0n);
    burnNext.set(
      c.id,
      discNext > 0n ? discNext / BigInt(Math.max(daysInNextMonth, 1)) : 0n,
    );
  }

  // Mutable running state.
  let cash = input.startCashCents;
  let reservePool = input.categories.reduce((s, c) => s + c.reserveCents, 0n);
  const reserve = new Map(input.categories.map((c) => [c.id, c.reserveCents]));
  const monthSpend = new Map(
    input.categories.map((c) => [c.id, c.spentSoFarCents]),
  );
  const prevOver = new Map(
    input.categories.map((c) => [
      c.id,
      c.spentSoFarCents > c.budgetThisMonthCents
        ? c.spentSoFarCents - c.budgetThisMonthCents
        : 0n,
    ]),
  );
  const budgetNow = new Map(
    input.categories.map((c) => [c.id, c.budgetThisMonthCents]),
  );
  let monthReserveTapped = false;
  let monthShort = false;
  let curYearMonth = startYearMonth;

  const days: DayCell[] = [];
  let firstYellowDate: string | null = null;
  let firstRedDate: string | null = null;
  let worstShortfall = 0n;

  for (
    let d = start;
    Temporal.PlainDate.compare(d, end) <= 0;
    d = d.add({ days: 1 })
  ) {
    const iso = d.toString();
    const ym = `${d.year}-${d.month}`;
    const inStartMonth = d.month === startMonth;

    // Month boundary: accrue leftover into reserve, reset, switch to next budget.
    if (ym !== curYearMonth) {
      for (const c of input.categories) {
        const leftover =
          (budgetNow.get(c.id) ?? 0n) - (monthSpend.get(c.id) ?? 0n);
        if (leftover > 0n) {
          reserve.set(c.id, (reserve.get(c.id) ?? 0n) + leftover);
          reservePool += leftover;
        }
        monthSpend.set(c.id, 0n);
        prevOver.set(c.id, 0n);
        budgetNow.set(c.id, c.budgetNextMonthCents);
      }
      monthReserveTapped = false;
      monthShort = false;
      curYearMonth = ym;
    }

    // Income lands.
    const incomeToday = incomeByDate.get(iso) ?? 0n;
    cash += incomeToday;

    const drew: DayReserveDraw[] = [];
    const short: DayReserveDraw[] = [];

    const applyOutflow = (catId: string, amt: bigint) => {
      if (amt <= 0n) return;
      cash -= amt;
      const spent = (monthSpend.get(catId) ?? 0n) + amt;
      monthSpend.set(catId, spent);
      const budget = budgetNow.get(catId) ?? 0n;
      const over = spent > budget ? spent - budget : 0n;
      const prev = prevOver.get(catId) ?? 0n;
      const newlyOver = over - prev;
      prevOver.set(catId, over);
      if (newlyOver > 0n) {
        const r = reserve.get(catId) ?? 0n;
        const draw = newlyOver < r ? newlyOver : r;
        if (draw > 0n) {
          reserve.set(catId, r - draw);
          reservePool -= draw;
          monthReserveTapped = true;
          drew.push({
            categoryId: catId,
            name: nameById.get(catId) ?? "",
            amountCents: draw,
          });
        }
        const s = newlyOver - draw;
        if (s > 0n) {
          monthShort = true;
          short.push({
            categoryId: catId,
            name: nameById.get(catId) ?? "",
            amountCents: s,
          });
        }
      }
    };

    // Dated bills first, then even discretionary burn.
    for (const b of billsByDate.get(iso) ?? []) {
      if (b.categoryId) applyOutflow(b.categoryId, b.amountCents);
      else cash -= b.amountCents; // uncategorised bill: cash only
    }
    for (const c of input.categories) {
      const burn = (inStartMonth ? burnThis : burnNext).get(c.id) ?? 0n;
      applyOutflow(c.id, burn);
    }

    // Colour: worst of liquidity and budget lenses.
    const liquidity: DayColor =
      cash >= 0n ? "green" : cash + reservePool >= 0n ? "yellow" : "red";
    const budgetLens: DayColor = monthShort
      ? "red"
      : monthReserveTapped
        ? "yellow"
        : "green";
    const color = worse(liquidity, budgetLens);

    if (color === "yellow" && !firstYellowDate) firstYellowDate = iso;
    if (color === "red" && !firstRedDate) firstRedDate = iso;
    const deficit = cash + reservePool;
    if (deficit < 0n && -deficit > worstShortfall) worstShortfall = -deficit;

    days.push({
      date: iso,
      color,
      availableCents: cash,
      drewReserve: drew,
      shortfall: short,
      incomeCents: incomeToday,
      billCents: billTotalByDate.get(iso) ?? 0n,
    });
  }

  return {
    currency: input.currency,
    days,
    incomePoints: input.incomePayments.map((e) => ({
      date: e.date,
      name: e.name,
      amountCents: e.amountCents,
    })),
    billPoints: input.bills.map((e) => ({
      date: e.date,
      name: e.name,
      categoryId: e.categoryId ?? null,
      amountCents: e.amountCents,
    })),
    summary: {
      firstYellowDate,
      firstRedDate,
      worstShortfallCents: worstShortfall,
    },
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd /home/claude/budget && bun test packages/budgeting/test/application/simulate-cashflow-projection.test.ts`
Expected: PASS (7 tests). If the month-boundary-accrual test is off, confirm July's discretionary burn leaves leftover (budget 100k, daysLeftThisMonth spreads it; leftover at close = budget − monthSpend). Adjust the fixture's July plan so the accrued reserve (~ enough) covers Aug's ~20k overshoot.

- [ ] **Step 5: Commit**

```bash
git add packages/budgeting/src/application/simulate-cashflow-projection.ts packages/budgeting/test/application/simulate-cashflow-projection.test.ts
git commit -m "feat(overview): pure cash-flow projection simulator + golden fixtures"
```

---

## Task 2: Occurrence enumeration helper

**Files:**

- Create: `packages/budgeting/src/application/compute-cashflow-projection.ts` (helper first; loader added in Task 3)
- Test: `packages/budgeting/test/application/enumerate-occurrences.test.ts`

**Interfaces:**

- Produces: `enumerateOccurrences(spec: CadenceSpec, opts: { seed: Temporal.PlainDate; afterExclusive: Temporal.PlainDate; end: Temporal.PlainDate }): string[]` — occurrence ISO dates in `(afterExclusive, end]`, seeded at `seed`, capped at `MAX_PROJECTION_STEPS`.
- Consumes: `nextOccurrence`, `CadenceSpec` from `../domain/cadence`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/budgeting/test/application/enumerate-occurrences.test.ts
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import { enumerateOccurrences } from "@budget/budgeting/src/application/compute-cashflow-projection";

const D = (s: string) => Temporal.PlainDate.from(s);

describe("enumerateOccurrences", () => {
  test("MONTHLY anchor 25: seeded at today, only strictly-future in window", () => {
    const out = enumerateOccurrences(
      { cadence: "MONTHLY", anchorDay: 25 },
      {
        seed: D("2026-07-15"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual(["2026-07-25", "2026-08-25"]);
  });

  test("bill seeded from a past nextDueDate advances past today", () => {
    const out = enumerateOccurrences(
      { cadence: "MONTHLY", anchorDay: 1 },
      {
        seed: D("2026-07-01"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual(["2026-08-01"]);
  });

  test("WEEKLY enumerates each matching day", () => {
    const out = enumerateOccurrences(
      { cadence: "WEEKLY", weeklyDow: 1 }, // Mondays
      {
        seed: D("2026-07-15"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-07-31"),
      },
    );
    expect(out).toEqual(["2026-07-20", "2026-07-27"]);
  });

  test("empty when no occurrence in window", () => {
    const out = enumerateOccurrences(
      { cadence: "YEARLY", anchorDay: 10, yearlyMonth: 12 },
      {
        seed: D("2026-07-15"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /home/claude/budget && bun test packages/budgeting/test/application/enumerate-occurrences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the file with the helper (loader added next task)**

```ts
// packages/budgeting/src/application/compute-cashflow-projection.ts
/**
 * compute-cashflow-projection.ts — impure loader for the Overview projection
 * timeline. Reads wallets / incomes / recurring rules / category budgets / month
 * spend via raw SQL over withTenantTx, pulls per-category reserve from the injected
 * reservePositions seam, FX-converts every amount to the budget currency, enumerates
 * dated income + bill events across the window, then hands a fully-materialised
 * CashflowSimInput to the pure simulateCashflow. Mirrors the raw-SQL style of
 * compute-upcoming-by-category.ts and recompute-income-under-planned-task.ts.
 */
import { Temporal } from "temporal-polyfill";
import { nextOccurrence, type CadenceSpec } from "../domain/cadence";

/** Backstop so a malformed cadence can never spin the projection loop forever. */
export const MAX_PROJECTION_STEPS = 400;

/**
 * Occurrence ISO dates strictly after `afterExclusive`, up to and including `end`,
 * following `spec` from `seed`. `seed` may be in the past (a recurring rule's
 * nextDueDate) — the loop advances until it clears `afterExclusive`.
 */
export function enumerateOccurrences(
  spec: CadenceSpec,
  opts: {
    seed: Temporal.PlainDate;
    afterExclusive: Temporal.PlainDate;
    end: Temporal.PlainDate;
  },
): string[] {
  const out: string[] = [];
  let cur = opts.seed;
  let steps = 0;
  while (
    Temporal.PlainDate.compare(cur, opts.end) <= 0 &&
    steps++ < MAX_PROJECTION_STEPS
  ) {
    if (Temporal.PlainDate.compare(cur, opts.afterExclusive) > 0) {
      out.push(cur.toString());
    }
    cur = nextOccurrence(spec, cur);
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd /home/claude/budget && bun test packages/budgeting/test/application/enumerate-occurrences.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/budgeting/src/application/compute-cashflow-projection.ts packages/budgeting/test/application/enumerate-occurrences.test.ts
git commit -m "feat(overview): occurrence enumeration helper for projection window"
```

---

## Task 3: Loader + boot wiring + route + integration test

**Files:**

- Modify: `packages/budgeting/src/application/compute-cashflow-projection.ts` (add loader `computeCashflowProjection`)
- Modify: `packages/budgeting/package.json` (exports)
- Modify: `apps/api/src/boot.ts` (construct + expose `getCashflowProjection`; add to deps type)
- Create: `apps/api/src/routes/overview-projection.ts`
- Modify: `apps/api/src/routes/budgets.ts` (register)
- Test: `apps/api/test/routes/overview-projection.test.ts`

**Interfaces:**

- Consumes: `simulateCashflow` (Task 1), `enumerateOccurrences` (Task 2), `sumWalletsToCurrency` from `./compute-budget-wealth-now`, `withTenantTx`/`TenantId`/`UserId` from `@budget/platform` + `@budget/shared-kernel`, injected `reservePositions` (shape `(i:{tenantId,budgetId,month?}) => Promise<Result<{positions: Map<string,{reserveCents: bigint}>}, Error>>`).
- Produces: `computeCashflowProjection(deps): (input:{tenantId;budgetId}) => Promise<CashflowProjection>`; `deps.budgeting.getCashflowProjection`; route `GET /:id/overview/projection`.

- [ ] **Step 1: Write the failing route integration test**

```ts
// apps/api/test/routes/overview-projection.test.ts
import { describe, test, expect, beforeAll } from "bun:test";
import { makeTestApp, seedBudgetWithSession } from "../helpers/test-app";

// Uses the same real-Postgres harness as apps/api/test/routes/overview-cards.test.ts.
describe("GET /budgets/:id/overview/projection", () => {
  let app: Awaited<ReturnType<typeof makeTestApp>>;
  let budgetId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await makeTestApp();
    ({ budgetId, cookie } = await seedBudgetWithSession(app));
  });

  test("returns a day series spanning today → end of next month", async () => {
    const res = await app.request(`/budgets/${budgetId}/overview/projection`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.currency).toBe("string");
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBeGreaterThan(28); // at least ~1 month + 1 day
    // strings, not bigints, at the boundary
    expect(typeof body.days[0].available_cents).toBe("string");
    expect(body.summary).toHaveProperty("worst_shortfall_cents");
    expect(["green", "yellow", "red"]).toContain(body.days[0].color);
  });

  test("unknown budget → 404 (IDOR guard)", async () => {
    const res = await app.request(
      `/budgets/00000000-0000-0000-0000-0000000000ff/overview/projection`,
      { headers: { cookie } },
    );
    expect(res.status).toBe(404);
  });
});
```

> Note: match the exact helper names used by `apps/api/test/routes/overview-cards.test.ts`. Read that file and mirror its app-boot + seed + auth-cookie helpers; the two assertions above are what matters.

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /home/claude/budget && bun test apps/api/test/routes/overview-projection.test.ts`
Expected: FAIL — route 404/undefined (`getCashflowProjection` not wired).

- [ ] **Step 3: Add the loader to `compute-cashflow-projection.ts`**

Append to the file:

```ts
import { sql } from "drizzle-orm";
import type { FxProvider } from "@budget/shared-kernel";
import type { Result } from "@budget/shared-kernel";
import { TenantId, UserId } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { sumWalletsToCurrency } from "./compute-budget-wealth-now";
import {
  simulateCashflow,
  type CashflowProjection,
  type CashflowCategoryInput,
  type CashflowEvent,
} from "./simulate-cashflow-projection";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type TxLike = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

type CadenceRow = {
  amount_cents: string;
  currency: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadence_anchor: number | null;
  weekly_dow: number | null;
  yearly_month: number | null;
};

const specOf = (r: CadenceRow): CadenceSpec => ({
  cadence: r.cadence,
  anchorDay: r.cadence_anchor ?? undefined,
  weeklyDow: r.weekly_dow ?? undefined,
  yearlyMonth: r.yearly_month ?? undefined,
});

export interface ComputeCashflowProjectionDeps {
  fxProvider: FxProvider;
  reservePositions: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<
    Result<{ positions: Map<string, { reserveCents: bigint }> }, Error>
  >;
  now?: () => Date;
}

export function computeCashflowProjection(deps: ComputeCashflowProjectionDeps) {
  return async (input: {
    tenantId: string;
    budgetId: string;
  }): Promise<CashflowProjection> => {
    const asOf = deps.now ? deps.now() : new Date();
    const today = Temporal.Now.plainDateISO();
    const startMonth = today.with({ day: 1 });
    const nextMonthStart = startMonth.add({ months: 1 });
    const windowEnd = nextMonthStart.with({ day: nextMonthStart.daysInMonth });
    const thisYm = `${today.year}-${String(today.month).padStart(2, "0")}`;
    const nextYm = `${nextMonthStart.year}-${String(nextMonthStart.month).padStart(2, "0")}`;
    const thisMonthStartStr = startMonth.toString();
    const thisMonthEndStr = startMonth
      .with({ day: startMonth.daysInMonth })
      .toString();
    const nextMonthStartStr = nextMonthStart.toString();
    const nextMonthEndStr = windowEnd.toString();

    // One read tx for all budget rows (read-only; no atomicity needed).
    const loaded = await withTenantTx(
      TenantId(input.budgetId),
      UserId(SYSTEM_USER_ID),
      async (txRaw) => {
        const tx = txRaw as TxLike;
        const meta = await tx.execute(sql`
          SELECT default_currency, cushion_mode_enabled
            FROM tenancy.budgets WHERE id = ${input.budgetId}::uuid`);
        if (meta.rows.length === 0) throw new Error("budget_not_found");
        const currency = (meta.rows[0] as { default_currency: string })
          .default_currency;
        const cushionMode = Boolean(
          (meta.rows[0] as { cushion_mode_enabled: boolean })
            .cushion_mode_enabled,
        );

        const wallets = await tx.execute(sql`
          SELECT (current_balance * 100)::bigint::text AS amount_cents, currency
            FROM budgeting.wallets
           WHERE tenant_id = ${input.tenantId}::uuid
             AND archived_at IS NULL
             AND wallet_type IN ('SPENDINGS'${cushionMode ? sql`, 'CUSHION'` : sql``})`);

        // Categories + this-month + next-month effective limits (active = cushion vs normal).
        const cats = await tx.execute(sql`
          SELECT c.id::text AS id, c.name AS name,
                 COALESCE(tl.normal_amount, 0)::text AS this_normal,
                 COALESCE(tl.cushion_amount, 0)::text AS this_cushion,
                 COALESCE(nl.normal_amount, 0)::text AS next_normal,
                 COALESCE(nl.cushion_amount, 0)::text AS next_cushion
            FROM budgeting.categories c
            LEFT JOIN budgeting.category_limits tl
              ON tl.category_id = c.id
             AND tl.effective_from <= ${thisMonthEndStr}::date
             AND (tl.effective_to IS NULL OR tl.effective_to > ${thisMonthStartStr}::date)
            LEFT JOIN budgeting.category_limits nl
              ON nl.category_id = c.id
             AND nl.effective_from <= ${nextMonthEndStr}::date
             AND (nl.effective_to IS NULL OR nl.effective_to > ${nextMonthStartStr}::date)
           WHERE c.tenant_id = ${input.tenantId}::uuid
             AND c.archived_at IS NULL`);

        const spend = await tx.execute(sql`
          SELECT category_id::text AS id, SUM(amount_converted_cents)::text AS spent
            FROM budgeting.expense_ledger
           WHERE tenant_id = ${input.tenantId}::uuid
             AND kind = 'SPENDING'
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
             AND transaction_date >= ${thisMonthStartStr}::date
             AND transaction_date <= ${thisMonthEndStr}::date
           GROUP BY category_id`);

        const incomes = await tx.execute(sql`
          SELECT name, (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month
            FROM budgeting.incomes
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true`);

        const rules = await tx.execute(sql`
          SELECT category_id::text AS category_id, note,
                 (amount * 100)::bigint::text AS amount_cents, currency,
                 cadence, cadence_anchor, weekly_dow, yearly_month,
                 next_due_date::text AS next_due
            FROM budgeting.recurring_rules
           WHERE tenant_id = ${input.tenantId}::uuid AND active = true`);

        return {
          currency,
          cushionMode,
          walletRows: wallets.rows,
          catRows: cats.rows,
          spendRows: spend.rows,
          incomeRows: incomes.rows,
          ruleRows: rules.rows,
        };
      },
    );
    if (loaded.isErr()) throw loaded.error;
    const L = loaded.value;
    const currency = L.currency;

    // Reserve R[c] from the existing seam.
    const rp = await deps.reservePositions({
      tenantId: input.tenantId,
      budgetId: input.budgetId,
    });
    const reserveByCat = rp.isOk()
      ? rp.value.positions
      : new Map<string, { reserveCents: bigint }>();

    // Start cash = spendable wallets, FX→ccy.
    const walletItems = L.walletRows.map((r) => ({
      amount_cents: BigInt((r as { amount_cents: string }).amount_cents),
      currency: (r as { currency: string }).currency,
    }));
    const startCashCents =
      walletItems.length > 0
        ? await sumWalletsToCurrency(
            walletItems,
            currency,
            deps.fxProvider,
            asOf,
          )
        : 0n;

    // FX one amount to budget ccy (reuses the tested sum helper per distinct item).
    const fxOne = async (cents: bigint, from: string): Promise<bigint> =>
      from === currency
        ? cents
        : await sumWalletsToCurrency(
            [{ amount_cents: cents, currency: from }],
            currency,
            deps.fxProvider,
            asOf,
          );

    const spentById = new Map<string, bigint>();
    for (const r of L.spendRows)
      spentById.set(
        (r as { id: string }).id,
        BigInt((r as { spent: string }).spent),
      );

    const categories: CashflowCategoryInput[] = (
      L.catRows as Record<string, string>[]
    ).map((r) => {
      const thisBudget = BigInt(L.cushionMode ? r.this_cushion : r.this_normal);
      const nextBudget = BigInt(L.cushionMode ? r.next_cushion : r.next_normal);
      return {
        id: r.id,
        name: r.name,
        budgetThisMonthCents: thisBudget,
        budgetNextMonthCents: nextBudget,
        spentSoFarCents: spentById.get(r.id) ?? 0n,
        reserveCents: reserveByCat.get(r.id)?.reserveCents ?? 0n,
      };
    });

    // Income payment dates (strictly future within window), amount FX'd once each.
    const incomePayments: CashflowEvent[] = [];
    for (const raw of L.incomeRows) {
      const r = raw as CadenceRow & { name: string };
      const cents = BigInt(r.amount_cents);
      if (cents === 0n) continue;
      const amt = await fxOne(cents, r.currency);
      for (const date of enumerateOccurrences(specOf(r), {
        seed: today,
        afterExclusive: today,
        end: windowEnd,
      })) {
        incomePayments.push({ date, name: r.name, amountCents: amt });
      }
    }

    // Recurring bills (seeded from nextDueDate), amount FX'd once each.
    const bills: CashflowEvent[] = [];
    for (const raw of L.ruleRows) {
      const r = raw as CadenceRow & {
        category_id: string | null;
        note: string | null;
        next_due: string;
      };
      const cents = BigInt(r.amount_cents);
      if (cents === 0n) continue;
      const amt = await fxOne(cents, r.currency);
      const seed = Temporal.PlainDate.from(r.next_due);
      for (const date of enumerateOccurrences(specOf(r), {
        seed,
        afterExclusive: today,
        end: windowEnd,
      })) {
        bills.push({
          date,
          name: r.note ?? "",
          categoryId: r.category_id,
          amountCents: amt,
        });
      }
    }

    void thisYm;
    void nextYm; // reserved for future per-month labels

    return simulateCashflow({
      today: today.toString(),
      windowEnd: windowEnd.toString(),
      currency,
      startCashCents,
      categories,
      incomePayments,
      bills,
    });
  };
}
```

- [ ] **Step 4: Export the subpaths in `packages/budgeting/package.json`**

Add under `"exports"` (mirror the existing `./src/application/compute-upcoming-by-category` entry):

```json
"./src/application/simulate-cashflow-projection": "./src/application/simulate-cashflow-projection.ts",
"./src/application/compute-cashflow-projection": "./src/application/compute-cashflow-projection.ts",
```

- [ ] **Step 5: Wire into `apps/api/src/boot.ts`**

Add the import near the other application imports (~line 54):

```ts
import { computeCashflowProjection } from "@budget/budgeting/src/application/compute-cashflow-projection";
```

Add to the budgeting deps type block (near `getOverviewCards: ReturnType<typeof getOverviewCards>;`, ~line 111):

```ts
/** Overview projection timeline (today → end of next month). */
getCashflowProjection: ReturnType<typeof computeCashflowProjection>;
```

Add to the `Object.assign(budgeting, { ... })` construction (near `getOverviewCards: getOverviewCards({...})`, ~line 373):

```ts
    getCashflowProjection: computeCashflowProjection({
      fxProvider: baseBudgeting.fxProvider,
      reservePositions: baseBudgeting.reservePositions,
    }),
```

- [ ] **Step 6: Create the route `apps/api/src/routes/overview-projection.ts`**

```ts
/**
 * overview-projection.ts — GET /budgets/:id/overview/projection.
 *
 * Registers the Overview cash-flow projection endpoint onto the budgets router
 * (mirrors registerOverviewCardsRoutes). Tenant guard: tenantIds.includes(budgetId)
 * → 404. bigint cents → string at this single boundary.
 */
import type { Hono } from "hono";
import type { BootedDeps } from "../boot";
import { serverError } from "../middleware/server-error";

export function registerOverviewProjectionRoutes(r: Hono, deps: BootedDeps) {
  r.get("/:id/overview/projection", async (c) => {
    const session = c.get("session");
    if (!session) return c.json({ error: "unauthorized" }, 401);

    const budgetId = c.req.param("id");
    const tenantIds = c.get("tenantIds") as string[] | undefined;
    if (!tenantIds || !tenantIds.includes(budgetId)) {
      return c.json({ error: "not_found" }, 404);
    }

    try {
      const p = await deps.budgeting.getCashflowProjection({
        tenantId: budgetId,
        budgetId,
      });
      return c.json(
        {
          currency: p.currency,
          days: p.days.map((d) => ({
            date: d.date,
            color: d.color,
            available_cents: d.availableCents.toString(),
            income_cents: d.incomeCents.toString(),
            bill_cents: d.billCents.toString(),
            drew_reserve: d.drewReserve.map((x) => ({
              category_id: x.categoryId,
              name: x.name,
              amount_cents: x.amountCents.toString(),
            })),
            shortfall: d.shortfall.map((x) => ({
              category_id: x.categoryId,
              name: x.name,
              amount_cents: x.amountCents.toString(),
            })),
          })),
          income_points: p.incomePoints.map((x) => ({
            date: x.date,
            name: x.name,
            amount_cents: x.amountCents.toString(),
          })),
          bill_points: p.billPoints.map((x) => ({
            date: x.date,
            name: x.name,
            category_id: x.categoryId,
            amount_cents: x.amountCents.toString(),
          })),
          summary: {
            first_yellow_date: p.summary.firstYellowDate,
            first_red_date: p.summary.firstRedDate,
            worst_shortfall_cents: p.summary.worstShortfallCents.toString(),
          },
        },
        200,
      );
    } catch (e) {
      return serverError(c, "overview_projection_failed", e as Error);
    }
  });
}
```

- [ ] **Step 7: Register the route in `apps/api/src/routes/budgets.ts`**

Add the import beside `registerOverviewCardsRoutes` (~line 19) and the call beside its registration (~line 28):

```ts
import { registerOverviewProjectionRoutes } from "./overview-projection";
// ...
registerOverviewProjectionRoutes(r, deps);
```

- [ ] **Step 8: Run the integration test, verify it passes**

Run: `cd /home/claude/budget && bun test apps/api/test/routes/overview-projection.test.ts`
Expected: PASS (2 tests). If the seed helper name differs, read `apps/api/test/routes/overview-cards.test.ts` and copy its exact bootstrap.

- [ ] **Step 9: Typecheck + commit**

```bash
cd /home/claude/budget && bun run --filter @budget/api typecheck 2>/dev/null || bunx tsc -p apps/api --noEmit
git add packages/budgeting/src/application/compute-cashflow-projection.ts packages/budgeting/package.json apps/api/src/boot.ts apps/api/src/routes/overview-projection.ts apps/api/src/routes/budgets.ts apps/api/test/routes/overview-projection.test.ts
git commit -m "feat(overview): cash-flow projection loader, route, and boot wiring"
```

---

## Task 4: Web hook + DTO type

**Files:**

- Create: `apps/web/src/hooks/use-projection.ts`

**Interfaces:**

- Produces: `useProjection(budgetId)`, `ProjectionDTO`, `fetchProjection(budgetId)`. Query key `["budget", budgetId, "projection"]`.
- Consumes: `clientApiFetch` from `@/lib/budget-fetch` (same as `use-spendings-summary.ts`).

- [ ] **Step 1: Create the hook**

```ts
"use client";
/**
 * use-projection.ts — TanStack Query hook for the Overview cash-flow projection.
 * queryKey: ["budget", budgetId, "projection"]. Mirrors use-spendings-summary.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export interface ProjectionDay {
  date: string;
  color: "green" | "yellow" | "red";
  available_cents: string;
  income_cents: string;
  bill_cents: string;
  drew_reserve: { category_id: string; name: string; amount_cents: string }[];
  shortfall: { category_id: string; name: string; amount_cents: string }[];
}

export interface ProjectionDTO {
  currency: string;
  days: ProjectionDay[];
  income_points: { date: string; name: string; amount_cents: string }[];
  bill_points: {
    date: string;
    name: string;
    category_id: string | null;
    amount_cents: string;
  }[];
  summary: {
    first_yellow_date: string | null;
    first_red_date: string | null;
    worst_shortfall_cents: string;
  };
}

export async function fetchProjection(
  budgetId: string,
): Promise<ProjectionDTO> {
  const res = await clientApiFetch(`/budgets/${budgetId}/overview/projection`);
  if (!res.ok) throw new Error("projection_fetch_failed");
  return await res.json();
}

export function useProjection(budgetId: string) {
  return useQuery({
    queryKey: ["budget", budgetId, "projection"] as const,
    queryFn: () => fetchProjection(budgetId),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /home/claude/budget/apps/web && bunx tsc --noEmit -p tsconfig.json 2>&1 | head -20
cd /home/claude/budget && git add apps/web/src/hooks/use-projection.ts
git commit -m "feat(overview): use-projection query hook + DTO type"
```

---

## Task 5: Projection banner — heat band + headline

**Files:**

- Create: `apps/web/src/components/budgeting/overview/projection-timeline.tsx`
- Test: `apps/web/test/projection-timeline.test.tsx`

**Interfaces:**

- Consumes: `useProjection`, `ProjectionDTO` (Task 4); `centsToDisplayCompact` from `@/lib/cents-format`; `formatShortDate` from `@/lib/format-date`; `cn` from `@/lib/utils`; `useTranslations` (next-intl).
- Produces: `ProjectionTimeline({ budgetId, currency? }: { budgetId: string; currency?: string })`.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/web/test/projection-timeline.test.tsx
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ProjectionTimeline } from "@/components/budgeting/overview/projection-timeline";
import type { ProjectionDTO } from "@/hooks/use-projection";

const messages = {
  bdp: {
    tab: {
      overview: {
        projection: {
          title: "Cash-flow forecast",
          onTrackThrough: "On track through {date}",
          tightAround: "Tightest around {date}",
          shortBy: "short {amount}",
          empty: "Add income or recurring rules to forecast",
          available: "Available",
          reserveShrinking: "Reserve shrinking",
          cantCover: "Can't cover",
          income: "Income",
          bill: "Bill",
        },
      },
    },
  },
};

const dto: ProjectionDTO = {
  currency: "USD",
  days: [
    {
      date: "2026-07-15",
      color: "green",
      available_cents: "100000",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    },
    {
      date: "2026-07-16",
      color: "yellow",
      available_cents: "-2000",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    },
    {
      date: "2026-07-17",
      color: "red",
      available_cents: "-9000",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [{ category_id: "c", name: "Food", amount_cents: "9000" }],
    },
  ],
  income_points: [],
  bill_points: [],
  summary: {
    first_yellow_date: "2026-07-16",
    first_red_date: "2026-07-17",
    worst_shortfall_cents: "9000",
  },
};

vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => ({ data: dto, isLoading: false, isError: false }),
}));

const renderIt = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProjectionTimeline budgetId="b1" currency="USD" />
    </NextIntlClientProvider>,
  );

describe("ProjectionTimeline", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders one band cell per day with the right color class", () => {
    renderIt();
    const cells = screen.getAllByTestId("projection-day");
    expect(cells).toHaveLength(3);
    expect(cells[0].getAttribute("data-color")).toBe("green");
    expect(cells[2].getAttribute("data-color")).toBe("red");
  });

  test("headline names the first trouble date", () => {
    renderIt();
    expect(screen.getByTestId("projection-headline").textContent).toContain(
      "16",
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /home/claude/budget/apps/web && bun run test projection-timeline`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the banner (band + headline; scrubber added Task 6)**

```tsx
"use client";
/**
 * projection-timeline.tsx — Overview cash-flow projection banner. A daily heat band
 * (green/yellow/red) from today → end of next month, with a danger-date headline.
 * The scrubber tooltip is layered on in a follow-up (Task 6).
 */
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useProjection, type ProjectionDay } from "@/hooks/use-projection";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { formatShortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

const COLOR_BG: Record<ProjectionDay["color"], string> = {
  green: "bg-[var(--trading-up)]",
  yellow: "bg-[var(--primary)]",
  red: "bg-[var(--trading-down)]",
};

export function ProjectionTimeline({
  budgetId,
  currency = "USD",
}: {
  budgetId: string;
  currency?: string;
}) {
  const t = useTranslations("bdp.tab.overview.projection");
  const { data, isLoading, isError } = useProjection(budgetId);

  const headline = useMemo(() => {
    if (!data) return "";
    const { first_yellow_date, first_red_date, worst_shortfall_cents } =
      data.summary;
    const firstTrouble = first_yellow_date ?? first_red_date;
    if (!firstTrouble) {
      const last = data.days.at(-1);
      return last
        ? t("onTrackThrough", { date: formatShortDate(last.date, "en") })
        : "";
    }
    const around = t("tightAround", {
      date: formatShortDate(firstTrouble, "en"),
    });
    if (first_red_date && worst_shortfall_cents !== "0") {
      return `${around} · ${t("shortBy", {
        amount: centsToDisplayCompact(
          worst_shortfall_cents,
          data.currency,
          "en",
        ),
      })}`;
    }
    return around;
  }, [data, t]);

  if (isLoading) {
    return <div className={cn(CARD, "h-[92px] animate-pulse")} aria-hidden />;
  }
  if (isError || !data || data.days.length === 0) {
    return (
      <div className={CARD}>
        <p className="text-sm text-[var(--muted-foreground)]">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className={CARD} data-testid="projection-timeline">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--body-on-dark)]">
          {t("title")}
        </h3>
        <span
          data-testid="projection-headline"
          className="truncate text-xs text-[var(--muted-foreground)]"
        >
          {headline}
        </span>
      </div>
      <div className="flex h-8 w-full min-w-0 gap-px overflow-hidden rounded-[var(--radius-md)]">
        {data.days.map((d) => (
          <span
            key={d.date}
            data-testid="projection-day"
            data-color={d.color}
            title={`${formatShortDate(d.date, "en")} · ${centsToDisplayCompact(
              d.available_cents,
              data.currency,
              "en",
            )}`}
            className={cn("h-full min-w-0 flex-1", COLOR_BG[d.color])}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd /home/claude/budget/apps/web && bun run test projection-timeline`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/overview/projection-timeline.tsx apps/web/test/projection-timeline.test.tsx
git commit -m "feat(overview): projection timeline heat band + danger-date headline"
```

---

## Task 6: Scrubber tooltip (hover + touch)

**Files:**

- Modify: `apps/web/src/components/budgeting/overview/projection-timeline.tsx`
- Modify: `apps/web/test/projection-timeline.test.tsx`

**Interfaces:**

- Consumes: everything from Task 5. Adds a controlled `activeIndex` cursor.

- [ ] **Step 1: Add the failing test (append inside the describe block)**

```tsx
test("scrubbing shows a tooltip with that day's available and shortfall", async () => {
  const { default: userEventDefault } =
    await import("@testing-library/user-event");
  const user = userEventDefault.setup();
  renderIt();
  const band = screen.getByTestId("projection-band");
  // pointermove over the band selects a day (jsdom has no layout → component
  // falls back to selecting by the nearest cell via data-index on pointer events)
  const cells = screen.getAllByTestId("projection-day");
  await user.hover(cells[2]);
  const tip = screen.getByTestId("projection-tooltip");
  expect(tip.textContent).toContain("Food");
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /home/claude/budget/apps/web && bun run test projection-timeline`
Expected: FAIL — no `projection-band` / `projection-tooltip`.

- [ ] **Step 3: Add the scrubber to the component**

Replace the band `<div>` and add tooltip state. Insert at the top of the component body:

```tsx
const [active, setActive] = useState<number | null>(null);
```

(add `useState` to the React import). Replace the band markup with:

```tsx
<div
  data-testid="projection-band"
  className="relative"
  onPointerLeave={() => setActive(null)}
>
  <div className="flex h-8 w-full min-w-0 gap-px overflow-hidden rounded-[var(--radius-md)]">
    {data.days.map((d, i) => (
      <span
        key={d.date}
        data-testid="projection-day"
        data-color={d.color}
        data-index={i}
        onPointerEnter={() => setActive(i)}
        className={cn(
          "h-full min-w-0 flex-1 cursor-pointer",
          COLOR_BG[d.color],
          active === i && "outline outline-2 outline-[var(--body-on-dark)]",
        )}
      />
    ))}
  </div>
  {active !== null && data.days[active] && (
    <ProjectionTooltip day={data.days[active]} currency={data.currency} t={t} />
  )}
</div>
```

Add the tooltip subcomponent below `ProjectionTimeline`:

```tsx
function ProjectionTooltip({
  day,
  currency,
  t,
}: {
  day: ProjectionDay;
  currency: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const money = (c: string) => centsToDisplayCompact(c, currency, "en");
  return (
    <div
      data-testid="projection-tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3 text-xs shadow-lg"
    >
      <div className="mb-1 font-medium text-[var(--body-on-dark)]">
        {formatShortDate(day.date, "en")}
      </div>
      <div className="flex justify-between gap-4 text-[var(--muted-foreground)]">
        <span>{t("available")}</span>
        <span className="text-[var(--body-on-dark)]">
          {money(day.available_cents)}
        </span>
      </div>
      {day.drew_reserve.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--primary)]">{t("reserveShrinking")}</div>
          {day.drew_reserve.map((r) => (
            <div key={r.category_id} className="flex justify-between gap-4">
              <span>{r.name}</span>
              <span>{money(r.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
      {day.shortfall.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--trading-down)]">{t("cantCover")}</div>
          {day.shortfall.map((s) => (
            <div key={s.category_id} className="flex justify-between gap-4">
              <span>{s.name}</span>
              <span>{money(s.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd /home/claude/budget/apps/web && bun run test projection-timeline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/budgeting/overview/projection-timeline.tsx apps/web/test/projection-timeline.test.tsx
git commit -m "feat(overview): projection scrubber tooltip (available, reserve shrink, shortfall)"
```

---

## Task 7: i18n strings (EN/PL/UK)

**Files:**

- Modify: `apps/web/messages/en.json`, `apps/web/messages/pl.json`, `apps/web/messages/uk.json`

**Interfaces:**

- Produces: `bdp.tab.overview.projection.*` keys consumed by Tasks 5–6.

- [ ] **Step 1: Add the `projection` block under `bdp.tab.overview` in each file**

`en.json`:

```json
"projection": {
  "title": "Cash-flow forecast",
  "onTrackThrough": "On track through {date}",
  "tightAround": "Tightest around {date}",
  "shortBy": "short {amount}",
  "empty": "Add income or recurring rules to see your forecast",
  "available": "Available",
  "reserveShrinking": "Reserve shrinking",
  "cantCover": "Can't cover",
  "income": "Income",
  "bill": "Bill"
}
```

`pl.json`:

```json
"projection": {
  "title": "Prognoza przepływu środków",
  "onTrackThrough": "Wszystko gra do {date}",
  "tightAround": "Najciaśniej około {date}",
  "shortBy": "brakuje {amount}",
  "empty": "Dodaj dochód lub reguły cykliczne, aby zobaczyć prognozę",
  "available": "Dostępne",
  "reserveShrinking": "Kurczy się rezerwa",
  "cantCover": "Nie starcza na",
  "income": "Dochód",
  "bill": "Rachunek"
}
```

`uk.json`:

```json
"projection": {
  "title": "Прогноз грошового потоку",
  "onTrackThrough": "Все гаразд до {date}",
  "tightAround": "Найскрутніше близько {date}",
  "shortBy": "не вистачає {amount}",
  "empty": "Додайте дохід або регулярні правила, щоб побачити прогноз",
  "available": "Доступно",
  "reserveShrinking": "Резерв зменшується",
  "cantCover": "Не вистачає на",
  "income": "Дохід",
  "bill": "Рахунок"
}
```

- [ ] **Step 2: Validate JSON parses**

Run: `cd /home/claude/budget && for f in en pl uk; do node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/$f.json'))" && echo "$f ok"; done`
Expected: `en ok` / `pl ok` / `uk ok`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/pl.json apps/web/messages/uk.json
git commit -m "i18n(overview): projection timeline strings (EN/PL/UK)"
```

---

## Task 8: Mount in Overview tab + E2E

**Files:**

- Modify: `apps/web/src/components/budgeting/overview/overview-tab.tsx`
- Create: `apps/web/e2e/features/overview-projection.feature`
- Create: `apps/web/e2e/page-objects/ProjectionTimelinePo.ts`
- Modify: the `@overview` step file that binds Overview page objects (mirror the existing overview feature's steps).

**Interfaces:**

- Consumes: `ProjectionTimeline` (Tasks 5–6). Needs the budget's default currency — the tab currently passes only `budgetId`; pass `currency` if already available from a parent, else let the component fetch it (it already reads `data.currency` from the projection response, so the `currency` prop is display-only fallback for the loading state).

- [ ] **Step 1: Insert the banner between cards and sections**

In `overview-tab.tsx`, add the import:

```tsx
import { ProjectionTimeline } from "@/components/budgeting/overview/projection-timeline";
```

And between `<OverviewCards .../>` and `<OverviewSections .../>`:

```tsx
<ProjectionTimeline budgetId={budgetId} />
```

- [ ] **Step 2: Write the E2E feature**

```gherkin
# apps/web/e2e/features/overview-projection.feature
@overview @projection
Feature: Overview cash-flow projection timeline

  Scenario: The projection banner renders with a day band
    Given a fresh verified user with a budget
    When I open the budget Overview tab
    Then I see the cash-flow projection banner
    And the projection band has at least 28 day cells

  Scenario: Scrubbing a day shows its tooltip
    Given a fresh verified user with a budget
    When I open the budget Overview tab
    And I hover the last day of the projection band
    Then I see the projection tooltip
```

- [ ] **Step 3: Write the page object**

```ts
// apps/web/e2e/page-objects/ProjectionTimelinePo.ts
import { type Page, expect } from "@playwright/test";

export class ProjectionTimelinePo {
  constructor(private page: Page) {}

  banner() {
    return this.page.getByTestId("projection-timeline");
  }

  async expectVisible() {
    await expect(this.banner()).toBeVisible();
  }

  dayCells() {
    return this.page.getByTestId("projection-day");
  }

  async expectAtLeastDays(n: number) {
    await expect
      .poll(async () => await this.dayCells().count())
      .toBeGreaterThanOrEqual(n);
  }

  async hoverLastDay() {
    const cells = this.dayCells();
    const count = await cells.count();
    await cells.nth(count - 1).hover();
  }

  async expectTooltip() {
    await expect(this.page.getByTestId("projection-tooltip")).toBeVisible();
  }
}
```

- [ ] **Step 4: Bind steps**

Read `apps/web/e2e/steps/` for the existing `@overview` step definitions and add (or reuse) steps binding the phrases above to `ProjectionTimelinePo`. Reuse the existing "fresh verified user with a budget" and "open the budget Overview tab" steps verbatim — only the three projection-specific `Then/When` phrases are new.

- [ ] **Step 5: Run the E2E scenario**

Run: `cd /home/claude/budget/apps/web && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test --grep @projection`
Expected: 2 scenarios PASS. (Requires the web+api images rebuilt — see Task 9. If run before deploy, expect failure; deploy first.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/budgeting/overview/overview-tab.tsx apps/web/e2e/features/overview-projection.feature apps/web/e2e/page-objects/ProjectionTimelinePo.ts apps/web/e2e/steps
git commit -m "feat(overview): mount projection timeline + @projection E2E"
```

---

## Task 9: Build, deploy, verify

**Files:** none (deploy + manual verify).

- [ ] **Step 1: Full backend test sweep**

Run: `cd /home/claude/budget && bun test packages/budgeting/test/application/simulate-cashflow-projection.test.ts packages/budgeting/test/application/enumerate-occurrences.test.ts apps/api/test/routes/overview-projection.test.ts`
Expected: all PASS.

- [ ] **Step 2: Rebuild + restart api + web (source is baked into images — see CLAUDE.md)**

Run:

```bash
cd /home/claude/budget
infisical run --env=dev -- docker compose --env-file .env --env-file .env.local build api web
infisical run --env=dev -- docker compose --env-file .env --env-file .env.local up -d --no-deps --force-recreate api web
docker compose ps
```

Expected: api + web healthy, recent uptime.

- [ ] **Step 3: Smoke the endpoint in-container**

Run:

```bash
docker compose exec -T api sh -lc 'curl -s localhost:3001/budgets/bbd0c07b-83e0-4e5e-bb56-c2861c9ad3c4/overview/projection -H "cookie: $TEST_COOKIE" | head -c 400'
```

(or drive it through the browser after sign-in). Expected: JSON with `days`, `summary`.

- [ ] **Step 4: Playwright verify on the canonical URL**

Run: `cd /home/claude/budget/apps/web && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test --grep @projection`
Expected: PASS. Then hand to the user for visual confirmation on iOS (band colors, scrubber on touch, all three locales).

- [ ] **Step 5: Final commit (if any lint/format changes)**

```bash
git add -A && git commit -m "chore(overview): projection timeline deploy verification" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**

- Window today→end of next month → Task 1 (`start`/`windowEnd`), Task 3 loader computes `windowEnd`. ✓
- Two-lens worst-of color, daily heat band, recovery, budget-lens sticky-within-month → Task 1 (`worse`, `monthReserveTapped`/`monthShort`, boundary reset). ✓
- Two-tier cash / single reserve pool no double-count → Task 1 (`reservePool` = Σ `reserveCents`; RESERVE wallets excluded in Task 3 wallet SQL). ✓
- Income upcoming-only, pay-day-past skipped → Task 3 (`enumerateOccurrences` seeded/after today). ✓
- Recurring via `nextOccurrence` from `nextDueDate` seed → Task 2/3. ✓
- Even discretionary burn, hatched → Task 1 (`burnThis`/`burnNext`); hatched rendering is a visual nicety folded into Task 5's band (solid fill shipped; hatch is optional polish, not a spec-blocking requirement — noted). ⚠ (see note)
- Month-boundary accrual, next-month effective limits, cushion mode both months → Task 1 boundary + Task 3 `cats` dual-limit SQL + `cushionMode`. ✓
- Endpoint shape, bigint→string → Task 3 route. ✓
- Placement, CARD style, markers, headline, scrubber tooltip → Tasks 5–6, mount Task 8. ✓
- Edge cases (empty, FX fallback, MAX_PROJECTION_STEPS) → Task 1 empty test, Task 3 `fxOne` same-ccy short-circuit + `sumWalletsToCurrency` fallback, Task 2 cap. ✓
- i18n EN/PL/UK → Task 7. ✓
- TDD every task → each task red→green→commit. ✓

**Note on hatched discretionary:** the spec lists "hatched = assumed" as an improvement. The band ships solid in Task 5; add a CSS hatch overlay on days whose outflow is discretionary-only as an optional follow-up. It is not gating and is called out here rather than left as a silent gap. Income (▲) / bill (●) markers likewise: the tooltip surfaces `income_cents`/`bill_cents` per day (Task 6) and `income_points`/`bill_points` are in the payload; dedicated marker glyphs on the band are a Task 5/6 visual add — if the user wants explicit ▲/● glyphs, add a marker row above the band reading `income_points`/`bill_points`.

**Placeholder scan:** no TBD/TODO; every code step has full code; test code is concrete. The only "read the neighbouring file" instructions are for test-harness helper names (Task 3 Step 1, Task 8 Step 4) — unavoidable because those helpers already exist and must be matched, not invented.

**Type consistency:** `CashflowSimInput`/`CashflowProjection`/`DayCell`/`ProjectionDay`/`ProjectionDTO` names match across Tasks 1→3→4→5→6. `reserveCents` (domain) vs `reserve_cents` — the reserve seam returns `{ reserveCents }` (verified in `get-reserve-positions.ts`), consumed as `reserveByCat.get(id)?.reserveCents` in Task 3. Route serializes to snake_case `*_cents` strings; hook DTO reads snake_case. Consistent. ✓
