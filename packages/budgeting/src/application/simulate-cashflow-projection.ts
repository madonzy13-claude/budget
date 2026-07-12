/**
 * simulate-cashflow-projection.ts — PURE forward cash-flow simulation for the
 * Overview projection timeline. No IO, no FX, no `Temporal.Now`: `today` and all
 * amounts (already FX'd to the budget currency by the loader) are passed in, so the
 * whole thing is golden-fixture testable. Walks each day from `today` to
 * `windowEnd`, refilling cash on income and paying dated bills + an even
 * discretionary burn from it. CASH-BASED reserve model: spending is paid from
 * cash first; only what cash can't cover dips into the reserve pot (attributed to
 * the category whose spending needed it), which depletes as used; when the reserve
 * is exhausted too, cash goes negative (uncovered). A day is red when available
 * (cash) is negative, yellow when reserve was used that day (cash still ≥ 0), else
 * green. Reserve-covered spending never reduces available.
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
  /** Reserve used per category ON THIS DAY — the spending that day that cash
   *  couldn't cover, funded from the reserve pot (per-day, not cumulative). */
  drewReserve: DayReserveDraw[];
  /** Spending per category ON THIS DAY that neither cash nor reserve could cover. */
  shortfall: DayReserveDraw[];
  incomeCents: bigint; // income landing that day
  billCents: bigint; // dated bills landing that day
}

/** "Available to spend" card health, derived from the projection (see deriveSpendHealth). */
export interface SpendHealth {
  /** Dot: true = green (no red day up to the last income), false = red,
   *  null = no upcoming income → neutral/grey dot. */
  good: boolean | null;
  /** Projected cash on the day before the NEAREST income (≥0 surplus, <0 deficit),
   *  or null when there is no upcoming income (card falls back to "upcoming"). */
  surplusDeficitCents: bigint | null;
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
  /** Card health for "Available to spend" (dot + surplus/deficit). */
  spendHealth: SpendHealth;
}

export interface CashflowSimInput {
  today: string;
  windowEnd: string;
  currency: string;
  startCashCents: bigint;
  /** The reserve pot = total RESERVE-wallet money (userDefined reserve — what the
   *  user sees as "available reserves"), the emergency money that funds spending
   *  cash can't cover. NOT the engine's per-category internal R. */
  reservePoolCents: bigint;
  categories: CashflowCategoryInput[];
  incomePayments: CashflowEvent[];
  bills: CashflowEvent[];
}

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
  // Reserve = one pot of emergency money (Σ per-category reserve, funded by the
  // RESERVE wallets). Cash-based model: spending is paid from cash; only what
  // cash can't cover dips into this pot, and it depletes as used (it does not
  // grow back from unspent budget). When it's gone too, spending is uncovered.
  let reservePool = input.reservePoolCents;

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
    // Compare year+month, not the bare month, so the burn switches to next
    // month's rate at the boundary (a 2-month window never repeats a month).
    const inStartMonth = `${d.year}-${d.month}` === startYearMonth;

    // Income lands.
    const incomeToday = incomeByDate.get(iso) ?? 0n;
    cash += incomeToday;

    // Per-day, per-category reserve used / uncovered shortfall.
    const reserveUsedMap = new Map<string, bigint>();
    const shortMap = new Map<string, bigint>();

    const applyOutflow = (catId: string, amt: bigint) => {
      if (amt <= 0n) return;
      // Pay from cash first (cash never funds below 0)...
      const fromCash = amt < cash ? amt : cash > 0n ? cash : 0n;
      cash -= fromCash;
      let deficit = amt - fromCash;
      if (deficit <= 0n) return;
      // ...then dip into the reserve pot, attributed to the category whose
      // spending needed it (reserve-covered spending does NOT reduce cash)...
      const fromReserve =
        deficit < reservePool ? deficit : reservePool > 0n ? reservePool : 0n;
      if (fromReserve > 0n) {
        reservePool -= fromReserve;
        reserveUsedMap.set(
          catId,
          (reserveUsedMap.get(catId) ?? 0n) + fromReserve,
        );
        deficit -= fromReserve;
      }
      // ...and if the reserve is exhausted too, it's truly uncovered: cash goes
      // negative (available < 0) and the category is short.
      if (deficit > 0n) {
        cash -= deficit;
        shortMap.set(catId, (shortMap.get(catId) ?? 0n) + deficit);
      }
    };

    // Dated bills first, then even discretionary burn.
    for (const b of billsByDate.get(iso) ?? []) {
      applyOutflow(b.categoryId ?? "", b.amountCents);
    }
    for (const c of input.categories) {
      applyOutflow(c.id, (inStartMonth ? burnThis : burnNext).get(c.id) ?? 0n);
    }

    const toRows = (m: Map<string, bigint>): DayReserveDraw[] =>
      [...m]
        .filter(([, v]) => v > 0n)
        .map(([categoryId, amountCents]) => ({
          categoryId,
          name: nameById.get(categoryId) ?? "",
          amountCents,
        }));
    const reserveUsed = toRows(reserveUsedMap);
    const short = toRows(shortMap);

    // Single cash-based lens: available (cash) negative → reserve is exhausted,
    // you're truly short → red; reserve used today (cash still ≥ 0) → yellow;
    // else green. Red reflects the real underwater state (can persist across days
    // until income lands); yellow is per-day (only the day reserve is used).
    const color: DayColor =
      cash < 0n ? "red" : reserveUsed.length > 0 ? "yellow" : "green";

    if (color === "yellow" && !firstYellowDate) firstYellowDate = iso;
    if (color === "red" && !firstRedDate) firstRedDate = iso;
    if (cash < 0n && -cash > worstShortfall) worstShortfall = -cash;

    days.push({
      date: iso,
      color,
      availableCents: cash,
      drewReserve: reserveUsed,
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
    spendHealth: deriveSpendHealth({ days, incomePoints: input.incomePayments }),
  };
}

/**
 * "Available to spend" card health from the projection.
 *  - NO upcoming income → { good: null, surplusDeficitCents: null }: the dot is
 *    neutral/grey and the card keeps showing its old "upcoming" figure.
 *  - Income exists → `good` is false when ANY day at/before the LAST income (in the
 *    today→end-of-next-month window) is red (a shortfall in that span ⇒ red); the
 *    surplus/deficit value is the projected cash on the day BEFORE the NEAREST
 *    (first) income — the low right before the next refill.
 */
export function deriveSpendHealth(proj: {
  days: Pick<DayCell, "date" | "color" | "availableCents">[];
  incomePoints: { date: string }[];
}): SpendHealth {
  const days = proj.days;
  // ISO dates sort lexicographically → [0] is the nearest, last is the latest.
  const incomeDates = proj.incomePoints.map((p) => p.date).sort();
  if (days.length === 0 || incomeDates.length === 0) {
    return { good: null, surplusDeficitCents: null };
  }

  const firstIncome = incomeDates[0]!;
  const lastIncome = incomeDates[incomeDates.length - 1]!;

  // Icon spans to the last income; value is the day before the nearest income.
  const good = !days.some((d) => d.color === "red" && d.date <= lastIncome);
  const cutoff = Temporal.PlainDate.from(firstIncome)
    .subtract({ days: 1 })
    .toString();
  const atCutoff =
    days.find((d) => d.date === cutoff) ??
    [...days].reverse().find((d) => d.date <= cutoff) ??
    days[0]!;

  return { good, surplusDeficitCents: atCutoff.availableCents };
}
