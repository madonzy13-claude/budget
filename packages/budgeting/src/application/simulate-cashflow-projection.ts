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
  /** 'YYYY-MM' → the active budget (cushion vs normal, picked by the loader) for
   *  that month. The window is 100 days, so it spans up to FIVE of them; a month
   *  with no entry has no plan. */
  budgetByMonth: Record<string, bigint>;
  /** Confirmed spend so far in the CURRENT month (before today). */
  spentSoFarCents: bigint;
  /** 0083: unbounded ("No limit"). It has no plan to stay inside, but unlike an
   *  uncategorised outflow that does NOT make its spend overspend — a category
   *  that cannot be overspent must not draw the reserve pot in the forecast
   *  either, or the projection contradicts the reserve engine. */
  noLimit?: boolean;
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
  /** Cash entering the day, before income and outflows. The FIRST day's opening
   *  is the wallet balance the "available to spend" card shows — the tooltip
   *  reads out the whole day as one equation:
   *    available = opening + income − bills − plannedBurn − pending + reserveCovered  */
  openingCents: bigint;
  /** Unanswered occurrences charged that day. Non-zero on the FIRST day only —
   *  they are already owed, so the window opens by paying them. */
  pendingCents: bigint;
  /** The even discretionary spend applied that day, across all categories. */
  plannedBurnCents: bigint;
  /** Σ drewReserve — spending the pot paid for, which never reduces cash. */
  reserveCoveredCents: bigint;
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
  /** Scheduled occurrences whose date passed with no confirmation. Their money
   *  is already inside the daily burn (the category's plan still holds it), so
   *  they move no cash here — they are echoed for the tooltip, which tells the
   *  user the payment is still counted and still drifting. */
  pendingPoints: {
    date: string;
    name: string;
    categoryId: string | null;
    amountCents: bigint;
  }[];
  /**
   * The money that can leave the budget TODAY — to invest, say — with every dip
   * in the window still covered: the LOWEST point the line reaches. Withdraw it
   * and the thinnest day sits exactly on zero; withdraw a złoty more and it goes
   * under. Negative means there is nothing to take and you are short by that
   * much. Meaningful only from a `spendTiming: "immediate"` run — see that
   * option for why (user, 260812).
   */
  safeToWithdraw: { cents: bigint; thinnestDate: string | null };
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
  /** The CEILING on all reserve cover: total RESERVE-wallet money (userDefined
   *  reserve — what the user sees as "available reserves"). Σ of the per-category
   *  R below can exceed it, and only this is real money. */
  reservePoolCents: bigint;
  /**
   * categoryId → the reserve THAT category has built (R). A category may only
   * spend its own: the pot is not a common overdraft. Without this the forecast
   * offered a 70,000 zł one-off in Sport the household's entire 16,212 zł of
   * reserve, every złoty of it earmarked elsewhere (user, 260812).
   * A category missing here — or an outflow with no category at all — has none.
   */
  reserveByCategory?: Record<string, bigint>;
  categories: CashflowCategoryInput[];
  incomePayments: CashflowEvent[];
  bills: CashflowEvent[];
  /** Unconfirmed occurrences dated on or before today (see `pendingPoints`). */
  pendingDrafts?: CashflowEvent[];
  /**
   * WHEN the discretionary plan is assumed to be spent.
   *
   * `even` (default) — dripped equally across the days left in each month. The
   * readable shape, and what the line draws.
   *
   * `immediate` — a month's whole remaining plan lands on its first day in the
   * window. The WORST case, and the only honest basis for "how much can I take
   * out and still be fine": you really could spend your month's plan tomorrow.
   * It is also the only schedule whose answer doesn't drift — an even drip
   * pushes more of the plan past each future date as today advances, so the
   * same untouched budget quietly looks better every morning (user, 260812).
   */
  spendTiming?: "even" | "immediate";
}

export function simulateCashflow(input: CashflowSimInput): CashflowProjection {
  const start = Temporal.PlainDate.from(input.today);
  const end = Temporal.PlainDate.from(input.windowEnd);

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

  const nameById = new Map(input.categories.map((c) => [c.id, c.name]));
  const monthKey = (d: Temporal.PlainDate) =>
    `${d.year}-${String(d.month).padStart(2, "0")}`;
  const startMonthKey = monthKey(start);

  // An occurrence whose date has passed with no answer yet is money the
  // household still HOLDS and has already COMMITTED. Wallet balances are
  // hand-maintained (`setBalance`; no ledger trigger writes them), so the złoty
  // is still inside `startCashCents` — and the bill is still owed. It comes off
  // the opening cash below, and off the plan it has already consumed, or the
  // same money gets charged twice.
  //
  // Only a START-month occurrence consumes a plan. An older one is owed in
  // full: the month whose plan would have paid it is behind us.
  //
  // Before this the input reached `pendingPoints` and nothing else, so an
  // occurrence in an UNBOUNDED category — no plan, therefore no burn to hide
  // inside — was represented nowhere at all, and "free to move" offered money
  // that was already spent (user, 260825).
  const pendingByCat = new Map<string, bigint>();
  const pendingCharges: {
    categoryId: string;
    amountCents: bigint;
    beyondPlan: boolean;
  }[] = [];
  for (const e of input.pendingDrafts ?? []) {
    // An occurrence from an EARLIER month is beyond any plan: the month whose
    // plan would have paid it is behind us, and it must not eat this month's
    // headroom either. Only a start-month one has a plan standing behind it.
    const startMonth = e.date.slice(0, 7) === startMonthKey;
    pendingCharges.push({
      categoryId: e.categoryId ?? "",
      amountCents: e.amountCents,
      beyondPlan: !startMonth,
    });
    if (!e.categoryId || !startMonth) continue;
    pendingByCat.set(
      e.categoryId,
      (pendingByCat.get(e.categoryId) ?? 0n) + e.amountCents,
    );
  }
  /** This month's plan already used up: confirmed spend + unanswered occurrences.
   *  Shrinks the BURN so the same money is not charged twice — the occurrence
   *  itself is charged below, through the same outflow path as every bill. */
  const consumedThisMonth = (c: CashflowCategoryInput): bigint =>
    c.spentSoFarCents + (pendingByCat.get(c.id) ?? 0n);

  // Per-category bill totals per MONTH: a dated bill keeps its share of that
  // month's plan, so only what is left over is discretionary.
  const billByMonth = new Map<string, bigint>(); // `${month}|${categoryId}`
  for (const e of input.bills) {
    if (!e.categoryId) continue;
    const k = `${e.date.slice(0, 7)}|${e.categoryId}`;
    billByMonth.set(k, (billByMonth.get(k) ?? 0n) + e.amountCents);
  }

  // Every month the window touches, with the day it first appears on and how
  // many days of that CALENDAR month remain from there. A 100-day window can
  // start mid-month and end mid-month, and neither end owns a whole plan: the
  // opening month has already spent part of itself, and the closing month is
  // only entered — its plan drips at the month's own rate and simply stops when
  // the window does.
  interface MonthSlice {
    key: string;
    firstDay: string; // ISO of its first day inside the window
    daysFromThere: number; // to the END of the calendar month
  }
  const slices: MonthSlice[] = [];
  for (
    let d = start;
    Temporal.PlainDate.compare(d, end) <= 0;
    d = d.add({ days: 1 })
  ) {
    const k = monthKey(d);
    if (slices.length === 0 || slices[slices.length - 1]!.key !== k) {
      slices.push({
        key: k,
        firstDay: d.toString(),
        daysFromThere: d.daysInMonth - d.day + 1,
      });
    }
  }

  // Discretionary money per category per month: plan − already spent (current
  // month only) − the bills dated inside it. Clamped at zero: a category whose
  // bills already exceed its plan has nothing left to drip.
  const discByMonth = new Map<string, bigint>(); // `${month}|${categoryId}`
  const burnByMonth = new Map<string, bigint>(); // even daily rate
  for (const s of slices) {
    for (const c of input.categories) {
      const budget = c.budgetByMonth[s.key] ?? 0n;
      const spent = s.key === startMonthKey ? consumedThisMonth(c) : 0n;
      const bills = billByMonth.get(`${s.key}|${c.id}`) ?? 0n;
      const disc = budget - spent - bills;
      const k = `${s.key}|${c.id}`;
      discByMonth.set(k, disc > 0n ? disc : 0n);
      burnByMonth.set(
        k,
        disc > 0n ? disc / BigInt(Math.max(s.daysFromThere, 1)) : 0n,
      );
    }
  }
  const firstDayOfSlice = new Map(slices.map((s) => [s.firstDay, s.key]));
  const immediate = input.spendTiming === "immediate";

  // Mutable running state.
  let cash = input.startCashCents;
  // What each category may still spend inside its plan this month. Reserve money
  // is earmarked against limits being EXCEEDED, so this is what decides whether
  // an outflow may reach the pot at all (user, 260811).
  const unbounded = new Set(
    input.categories.filter((c) => c.noLimit === true).map((c) => c.id),
  );
  const remainingLimit = new Map<string, bigint>();
  const rollLimitsTo = (month: string) => {
    for (const c of input.categories) {
      const budget = c.budgetByMonth[month] ?? 0n;
      const spent = month === startMonthKey ? c.spentSoFarCents : 0n;
      const left = budget - spent;
      remainingLimit.set(c.id, left > 0n ? left : 0n);
    }
  };
  rollLimitsTo(startMonthKey);
  // Reserve, in two layers. Each category may spend only the reserve IT has
  // built (R, depleting as it goes), and every draw together is capped by the
  // money actually sitting in the RESERVE wallets — Σ R can exceed it. Spending
  // is paid from cash first; only what cash can't cover, and only the part
  // BEYOND the category's plan, may reach either layer. When both are spent the
  // spending is uncovered.
  let reservePool = input.reservePoolCents;
  const reserveLeft = new Map<string, bigint>(
    Object.entries(input.reserveByCategory ?? {}),
  );

  const firstDayIso = start.toString();
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
    const month = monthKey(d);
    // A new month restores every plan in full — and, under worst-case timing,
    // hands the whole of it over at once.
    const opensAMonth = firstDayOfSlice.get(iso) === month;
    if (opensAMonth && month !== startMonthKey) rollLimitsTo(month);

    // Cash entering the day — the figure the tooltip's equation starts from.
    const openingCents = cash;

    // Income lands.
    const incomeToday = incomeByDate.get(iso) ?? 0n;
    cash += incomeToday;

    // Per-day, per-category reserve used / uncovered shortfall.
    const reserveUsedMap = new Map<string, bigint>();
    const shortMap = new Map<string, bigint>();

    const applyOutflow = (catId: string, amt: bigint, beyondPlan = false) => {
      if (amt <= 0n) return;
      // Split the outflow at the category's remaining plan. Only what lies
      // BEYOND it is overspend, and only overspend may reach the reserve pot —
      // the forecast used to treat the pot as a general overdraft, so a bill
      // sitting well inside an untouched limit still painted the day yellow
      // when the real problem was an empty spending wallet (user, 260811).
      // An outflow with no category has no plan to stay inside, so all of it
      // counts as beyond one.
      // `beyondPlan` says there is no plan standing behind this outflow at all —
      // an occurrence from a month already closed. None of it is in-plan, and it
      // leaves this month's headroom untouched.
      const remaining = beyondPlan ? 0n : (remainingLimit.get(catId) ?? 0n);
      const withinLimit = amt < remaining ? amt : remaining;
      // 0083: an unbounded category's spend is never overspend, so it never
      // reaches the reserve pot. Its plan is 0, so the generic path above would
      // otherwise class the whole outflow as beyond-plan.
      const overspend = unbounded.has(catId) ? 0n : amt - withinLimit;
      if (!beyondPlan) remainingLimit.set(catId, remaining - withinLimit);

      // The OVERSPEND part draws the reserve FIRST — before cash, not after it.
      //
      // This used to pay from cash and consult the pot only once cash had run
      // out, which made an earmarked reserve behave like an emergency overdraft:
      // a 4,500 camping bill against a 2,669 Travel plan came entirely out of
      // spendable cash while 3,598 sat in Travel's own reserve, built for
      // exactly that bill (user, 260830). The plan is what says how much of an
      // outflow is ordinary spending; what lies beyond it is what the reserve is
      // for, and whether the spending wallet happened to be fat that day says
      // nothing about it.
      //
      // Nor is it sleight of hand in cash terms: reserve money sits in the
      // RESERVE wallets, which never enter startCash, so drawing it genuinely
      // leaves the spending balance alone. That is why reserve-covered spending
      // does not reduce cash.
      //
      // Two ceilings, both real: the category's OWN R — a category cannot spend
      // a reserve another category built — and the money actually in the RESERVE
      // wallets. Both deplete.
      const ownReserve = reserveLeft.get(catId) ?? 0n;
      const cap = ownReserve < reservePool ? ownReserve : reservePool;
      const fromReserve = overspend < cap ? overspend : cap > 0n ? cap : 0n;
      if (fromReserve > 0n) {
        reservePool -= fromReserve;
        reserveLeft.set(catId, ownReserve - fromReserve);
        reserveUsedMap.set(
          catId,
          (reserveUsedMap.get(catId) ?? 0n) + fromReserve,
        );
      }

      // Everything the reserve did not take is paid from cash (cash never funds
      // below 0 in this step)...
      const owed = amt - fromReserve;
      const fromCash = owed < cash ? owed : cash > 0n ? cash : 0n;
      cash -= fromCash;
      const deficit = owed - fromCash;
      // ...and if cash cannot cover the rest either, it is truly uncovered: cash
      // goes negative (available < 0) and the category is short.
      if (deficit > 0n) {
        cash -= deficit;
        shortMap.set(catId, (shortMap.get(catId) ?? 0n) + deficit);
      }
    };

    // Occurrences already owed come first — the window opens by paying them —
    // then the day's dated bills, then the even discretionary burn.
    let pendingToday = 0n;
    if (iso === firstDayIso) {
      for (const c of pendingCharges) {
        pendingToday += c.amountCents;
        applyOutflow(c.categoryId, c.amountCents, c.beyondPlan);
      }
    }
    for (const b of billsByDate.get(iso) ?? []) {
      applyOutflow(b.categoryId ?? "", b.amountCents);
    }
    let plannedBurnCents = 0n;
    for (const c of input.categories) {
      const k = `${month}|${c.id}`;
      const burn = immediate
        ? opensAMonth
          ? (discByMonth.get(k) ?? 0n)
          : 0n
        : (burnByMonth.get(k) ?? 0n);
      plannedBurnCents += burn;
      applyOutflow(c.id, burn);
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
      openingCents,
      plannedBurnCents,
      pendingCents: pendingToday,
      reserveCoveredCents: reserveUsed.reduce((s, r) => s + r.amountCents, 0n),
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
    safeToWithdraw: troughOf(days),
    pendingPoints: (input.pendingDrafts ?? []).map((e) => ({
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
    spendHealth: deriveSpendHealth({
      days,
      incomePoints: input.incomePayments,
    }),
  };
}

/** The deepest the line goes, and the day it happens. Empty window → 0/null. */
export function troughOf(days: Pick<DayCell, "date" | "availableCents">[]): {
  cents: bigint;
  thinnestDate: string | null;
} {
  if (days.length === 0) return { cents: 0n, thinnestDate: null };
  let low = days[0]!;
  for (const d of days) if (d.availableCents < low.availableCents) low = d;
  return { cents: low.availableCents, thinnestDate: low.date };
}

/**
 * "Available to spend" card health from the projection.
 *
 * THE ICON (`good`) — false when ANY day in the projection is red, i.e. cash
 * goes below zero at some point in the today→end-of-next-month window. Income
 * is irrelevant to the verdict, and so is where the last pay-day falls (user,
 * 260811).
 *
 * Both of those used to narrow it, and both hid real holes: with no income the
 * card gave no verdict at all, and with income it stopped looking at the last
 * pay-day — so a budget that went underwater after it was reported as fine. The
 * card now says exactly what the forecast line beside it draws.
 *
 * THE VALUE (`surplusDeficitCents`) is unchanged and still needs income: it is
 * the projected cash on the day BEFORE the NEAREST income — the low right
 * before the next refill. With no income there is no such day, so it stays
 * null and the card keeps showing its "Upcoming" figure instead.
 */
export function deriveSpendHealth(proj: {
  days: Pick<DayCell, "date" | "color" | "availableCents">[];
  incomePoints: { date: string }[];
}): SpendHealth {
  const days = proj.days;
  // ISO dates sort lexicographically → [0] is the nearest, last is the latest.
  const incomeDates = proj.incomePoints.map((p) => p.date).sort();
  // Nothing projected at all is the one case with no verdict to give.
  if (days.length === 0) return { good: null, surplusDeficitCents: null };

  // The verdict: any red day anywhere in the window.
  const good = !days.some((d) => d.color === "red");
  if (incomeDates.length === 0) return { good, surplusDeficitCents: null };

  const firstIncome = incomeDates[0]!;
  const cutoff = Temporal.PlainDate.from(firstIncome)
    .subtract({ days: 1 })
    .toString();
  const atCutoff =
    days.find((d) => d.date === cutoff) ??
    [...days].reverse().find((d) => d.date <= cutoff) ??
    days[0]!;

  return { good, surplusDeficitCents: atCutoff.availableCents };
}
