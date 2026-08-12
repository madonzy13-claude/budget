/**
 * upcoming-schedule.ts — what the household has actually committed to, month by
 * month, from today to the last thing on the calendar (260807 request).
 *
 * The chart this replaces drew a calendar YEAR of RATES: a 2,500 renewal became
 * 208 every month, twelve identical bars, the lump erased. That answers "what
 * do these cost on average", which is a question the planned charts already
 * answer. This one answers "what is coming", so a payment appears in the month
 * it really falls in and nowhere else.
 *
 * The window ends at the furthest `next_due_date` across every active payment —
 * the household's own rule, and one-time payments count because their date IS
 * their next due. A rhythm's next due is usually next month, so it is the rare
 * things (a yearly renewal, a sofa in 2029) that decide how far the chart looks.
 *
 * Weekly and daily payments contribute their per-month TOTAL rather than four
 * separate hits: on a monthly axis the individual days say nothing the total
 * does not.
 *
 * Pure: ISO strings and integer cents, no clock, no Temporal.
 */
import type { Cadence } from "./cadence";
import {
  DAYS_PER_MONTH,
  WEEKS_PER_MONTH,
} from "../application/scheduled-monthly-normalize";

export interface UpcomingPayment {
  /** What the household called it (its note), else the category name. */
  name: string;
  amount_cents: bigint;
  cadence: Cadence;
  /** 1=Jan … 12=Dec, for YEARLY. Falls back to the next-due month. */
  yearly_month: number | null;
  next_due_date: string; // ISO YYYY-MM-DD
  /** Deadline, inclusive. null = runs forever. */
  end_date?: string | null;
}

export interface UpcomingMonth {
  month: string; // YYYY-MM
  cents: bigint;
  items: { name: string; amount_cents: string }[];
}

const monthOf = (iso: string) => iso.slice(0, 7);

/** 'YYYY-MM' + n months. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

/**
 * The last month the chart should draw: the furthest next-due across every
 * payment, never earlier than the month we are in (an overdue payment still
 * needs its bar). null when nothing is scheduled — an empty chart, not a year
 * of zeroes.
 */
export function upcomingHorizon(
  payments: readonly UpcomingPayment[],
  todayISO: string,
): string | null {
  if (payments.length === 0) return null;
  const thisMonth = monthOf(todayISO);
  return payments.reduce(
    (far, p) => (monthOf(p.next_due_date) > far ? monthOf(p.next_due_date) : far),
    thisMonth,
  );
}

/** Whether `payment` fires in `month`, and for how much. 0n = not this month. */
function amountInMonth(p: UpcomingPayment, month: string): bigint {
  // Nothing fires before its own next occurrence: a rhythm already paid this
  // month has moved on, and charging it again would double-count.
  if (month < monthOf(p.next_due_date)) return 0n;
  if (p.end_date && month > monthOf(p.end_date)) return 0n;

  if (p.cadence === "ONCE") {
    return month === monthOf(p.next_due_date) ? p.amount_cents : 0n;
  }
  if (p.cadence === "YEARLY") {
    // Its own month, once a year. Without a stored month the next due date says
    // which one it is.
    const mm = String(
      p.yearly_month ?? Number(monthOf(p.next_due_date).slice(5)),
    ).padStart(2, "0");
    return month.endsWith(`-${mm}`) ? p.amount_cents : 0n;
  }
  if (p.cadence === "MONTHLY") return p.amount_cents;
  // WEEKLY / DAILY → the month's total.
  return p.cadence === "WEEKLY"
    ? (p.amount_cents * BigInt(Math.round(WEEKS_PER_MONTH * 1000)) + 500n) /
        1000n
    : (p.amount_cents * BigInt(Math.round(DAYS_PER_MONTH * 100)) + 50n) / 100n;
}

/**
 * One entry per month from today's month to the horizon, inclusive. Months with
 * nothing due are present and zero — a gap in the middle of a bar chart reads
 * as missing data rather than as a quiet month.
 */
export function upcomingByMonth(
  payments: readonly UpcomingPayment[],
  todayISO: string,
): UpcomingMonth[] {
  const last = upcomingHorizon(payments, todayISO);
  if (last === null) return [];

  const out: UpcomingMonth[] = [];
  for (let month = monthOf(todayISO); month <= last; month = addMonths(month, 1)) {
    const items: UpcomingMonth["items"] = [];
    let cents = 0n;
    for (const p of payments) {
      const amount = amountInMonth(p, month);
      if (amount <= 0n) continue;
      cents += amount;
      items.push({ name: p.name, amount_cents: amount.toString() });
    }
    out.push({ month, cents, items });
  }
  return out;
}
