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
      // ponytail: zero budget = unconstrained / pass-through; only cash lens applies
      if (budget === 0n) return;
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
