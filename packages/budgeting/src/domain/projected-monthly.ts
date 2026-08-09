/**
 * projected-monthly.ts — what a category will cost in an average month from
 * here (260808, user request).
 *
 * One number, used in two places that used to disagree: the Future chart draws
 * it against today's limit, and the limit suggestion IS it.
 *
 * Three rules, in the order the household asked for them:
 *
 * 1. THE AVERAGE IS OVER THE WINDOW. Divide by the months of the range the
 *    category has actually existed for — not by the months that happen to
 *    carry a figure. Giving twice in a year is a twelfth of those two gifts
 *    each month, not half of them.
 *
 * 2. A REPEATING PAYMENT IS COUNTED ONCE, and the LEDGER says so — nothing
 *    here infers it. The spend handed in is ORDINARY: whatever is linked to a
 *    rule has already been taken out of it at source, so every rule is simply
 *    added, once, at its monthly size.
 *
 *    An earlier version guessed instead: it treated a rule as already inside
 *    the observed spending up to whatever that spending could cover. That
 *    quietly swallowed genuinely new rules, and guessing is not this layer's
 *    job (user, 260809). Where history predates the rules — an import — the
 *    links are made once, deliberately, by a backfill; after that the fact is
 *    on the row and the arithmetic is deterministic.
 *
 * 3. A ONE-OFF IS SAVED FOR. It has not happened, so no history can account
 *    for it; it is split over the months between now and the day it lands.
 *
 * Pure: integer cents, no clock, no IO.
 */
import {
  scheduledMonthlyNormalize,
  type Cadence,
} from "../application/scheduled-monthly-normalize";

export interface ProjectionRule {
  amount_cents: bigint;
  cadence: Cadence | "ONCE";
  /** 1=Jan … 12=Dec, for YEARLY. */
  yearly_month: number | null;
  /** ISO date. For ONCE this is the day it lands. */
  next_due_date?: string | null;
}

export interface ProjectedMonthlyInput {
  /** Months of the range the category existed in, 'YYYY-MM', oldest first. */
  windowMonths: readonly string[];
  /** ORDINARY spend in each of those months: the month's total, less the
   *  one-offs the household set aside, less whatever the ledger links to a
   *  scheduled payment. A month with no entry cost nothing. */
  spentByMonth: ReadonlyMap<string, bigint>;
  rules: readonly ProjectionRule[];
  /** The month the projection is made FROM — one-offs are split from here. */
  fromMonth: string;
  /** What this category's reserve already holds. Credited against the one-offs
   *  ahead of it, soonest first: money set aside is not money to save again. */
  reserveHeldCents?: bigint;
}

/** Whole months from `a` to `b` ('YYYY-MM'), negative if b is earlier. */
function monthsApart(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return by * 12 + bm - (ay * 12 + am);
}

export function projectedMonthly(input: ProjectedMonthlyInput): bigint {
  const {
    windowMonths,
    spentByMonth,
    rules,
    fromMonth,
    reserveHeldCents: reserveHeld = 0n,
  } = input;

  // 1. The habit: everything the category actually cost, over every month of
  //    the window — the empty ones included, because a month it spent nothing
  //    in is a month it spent nothing in.
  const span = BigInt(windowMonths.length);
  const observed =
    span > 0n
      ? windowMonths.reduce((acc, m) => acc + (spentByMonth.get(m) ?? 0n), 0n) /
        span
      : 0n;

  // 2. Every repeating rule, at its monthly size. Once each: the habit above
  //    is ordinary spend, which by definition excludes them.
  const recurring = rules
    .filter((r) => r.cadence !== "ONCE")
    .reduce(
      (acc, r) =>
        acc + scheduledMonthlyNormalize(r.amount_cents, r.cadence as Cadence),
      0n,
    );

  // 3. One-offs: split over the months BEFORE the one it lands in, so the
  //    money is there whatever day of that month it is charged on. A date
  //    already gone asks for nothing; one landing this month asks for all of
  //    it, because there is no month left to spread it over.
  //
  //    …less whatever the category's reserve ALREADY holds for it. Spreading a
  //    trip that is paid for over the months to it funds it a second time out
  //    of income, and then the reserve holding the first copy reads as spare —
  //    the chart offered to empty a 17,315 buffer for a 17,000 trip (user,
  //    260809). Soonest first: that is the one the money will be spent on.
  //    Only ONE-OFFS are credited; a yearly bill returns every year and no
  //    reserve pre-funds it for ever.
  let credit = reserveHeld > 0n ? reserveHeld : 0n;
  const oneOffs = rules
    .filter(
      (r): r is ProjectionRule & { next_due_date: string } =>
        r.cadence === "ONCE" &&
        !!r.next_due_date &&
        monthsApart(fromMonth, r.next_due_date.slice(0, 7)) >= 0,
    )
    .sort((a, b) => (a.next_due_date < b.next_due_date ? -1 : 1));

  let saving = 0n;
  for (const r of oneOffs) {
    const away = monthsApart(fromMonth, r.next_due_date.slice(0, 7));
    const covered = credit < r.amount_cents ? credit : r.amount_cents;
    credit -= covered;
    const outstanding = r.amount_cents - covered;
    saving += outstanding / BigInt(away > 0 ? away : 1);
  }

  return observed + recurring + saving;
}
