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
 * 2. A REPEATING PAYMENT IS COUNTED ONCE. Its charges are already inside the
 *    history whenever they have been paid, and the ledger's own link only
 *    names them from the day the rule was recorded — which for an alimony
 *    paid all year and scheduled last month is a year too late. So the
 *    history is the witness: a rule is taken as already inside the observed
 *    spending up to the amount that spending can account for, and only the
 *    remainder is new money. Two rules cannot claim the same złoty.
 *
 *    Where this is wrong: a genuinely NEW rule added to a category that
 *    already spends more than it. Nothing in the data separates that from a
 *    long-standing cost only just written down, and the error is bounded by
 *    the rule's own size — where charging it twice was not.
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
  /** What it cost in each of those months, one-offs the household set aside
   *  already removed. A month with no entry cost nothing. */
  spentByMonth: ReadonlyMap<string, bigint>;
  rules: readonly ProjectionRule[];
  /** The month the projection is made FROM — one-offs are split from here. */
  fromMonth: string;
}

/** Whole months from `a` to `b` ('YYYY-MM'), negative if b is earlier. */
function monthsApart(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number) as [number, number];
  const [by, bm] = b.split("-").map(Number) as [number, number];
  return by * 12 + bm - (ay * 12 + am);
}

export function projectedMonthly(input: ProjectedMonthlyInput): bigint {
  const { windowMonths, spentByMonth, rules, fromMonth } = input;

  // 1. The habit: everything the category actually cost, over every month of
  //    the window — the empty ones included, because a month it spent nothing
  //    in is a month it spent nothing in.
  const span = BigInt(windowMonths.length);
  const observed =
    span > 0n
      ? windowMonths.reduce((acc, m) => acc + (spentByMonth.get(m) ?? 0n), 0n) /
        span
      : 0n;

  // 2. Repeating rules, largest first so the allocation below is stable.
  const repeating = rules
    .filter((r) => r.cadence !== "ONCE")
    .map((r) => ({
      rule: r,
      monthly: scheduledMonthlyNormalize(r.amount_cents, r.cadence as Cadence),
    }))
    .sort((a, b) => (b.monthly > a.monthly ? 1 : b.monthly < a.monthly ? -1 : 0));

  // How much of the observed spending is still unclaimed. Each rule takes what
  // it can from it — that part of the rule is already in the average — and only
  // what is left over is money the limit does not yet cover.
  let unclaimed = observed;
  let extra = 0n;
  for (const { monthly } of repeating) {
    const absorbed = monthly < unclaimed ? monthly : unclaimed;
    unclaimed -= absorbed;
    extra += monthly - absorbed;
  }

  // 3. One-offs: split over the months BEFORE the one it lands in, so the
  //    money is there whatever day of that month it is charged on. A date
  //    already gone asks for nothing; one landing this month asks for all of
  //    it, because there is no month left to spread it over.
  let saving = 0n;
  for (const r of rules) {
    if (r.cadence !== "ONCE" || !r.next_due_date) continue;
    const due = r.next_due_date.slice(0, 7);
    const away = monthsApart(fromMonth, due);
    if (away < 0) continue;
    saving += r.amount_cents / BigInt(away > 0 ? away : 1);
  }

  return observed + extra + saving;
}
