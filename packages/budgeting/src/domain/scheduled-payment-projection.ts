/**
 * scheduled-payment-projection.ts — the spend a category is already committed to (260804).
 *
 * Reserve sizing that only looks backwards is blind to the charge you KNOW is
 * coming: a September insurance renewal needs its money by September, and a
 * range that never covered a September would size that buffer at zero.
 *
 * Deliberately NOT scheduledMonthlyNormalize: that spreads a yearly charge over
 * twelve months so the scheduled CHART can compare cadences. Here the lump is
 * the point — 5,000 in one month and nothing in the other eleven is exactly the
 * shape a reserve exists to absorb.
 *
 * Weekly and daily rules use average-month constants: their per-month total is
 * what matters, and which day they land on is noise against a monthly walk.
 *
 * Each month comes back split two ways (260804). A rule that fires EVERY month
 * (or oftener) is ROUTINE — the limit was set knowing about it, so it lives
 * inside the plan. A rule that fires once a year is ON TOP: September still has
 * its ordinary fuel and parking, so a 2,500 insurance renewal is 2,500 MORE
 * than that month's budget, not 2,500 of it. Sizing a buffer at "charge minus
 * limit" left the charge covered and the ordinary month uncovered.
 */
import {
  DAYS_PER_MONTH,
  WEEKS_PER_MONTH,
} from "../application/scheduled-monthly-normalize";

export type ProjectableCadence =
  | "ONCE"
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY";

export interface ProjectableRule {
  category_id: string | null;
  amount_cents: bigint;
  cadence: ProjectableCadence;
  /** 1=Jan … 12=Dec. Required for YEARLY; anything else is not projectable. */
  yearly_month: number | null;
  /** ISO date. Required for ONCE — a one-time payment IS its date, and there is
   *  no pattern to derive one from. Ignored for every other cadence. */
  next_due_date?: string | null;
}

/** 'YYYY-MM' + n months. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const zero = y * 12 + (m - 1) + n;
  return `${Math.floor(zero / 12)}-${String((zero % 12) + 1).padStart(2, "0")}`;
}

/** What a month is committed to, split by whether the plan already covers it. */
export interface MonthCommitment {
  /** Fires every month or oftener — inside the limit. */
  routine: bigint;
  /** Fires rarely — on top of the limit. */
  onTop: bigint;
}

/**
 * @param rules      active scheduled rules (any cadence).
 * @param fromMonth  first projected month, 'YYYY-MM'.
 * @param months     how many months forward to project.
 * @returns categoryId → month → commitment. Categories with nothing committed
 *          are absent rather than present-and-zero.
 */
export function projectScheduledPayments(
  rules: readonly ProjectableRule[],
  fromMonth: string,
  months: number,
): Map<string, Map<string, MonthCommitment>> {
  const out = new Map<string, Map<string, MonthCommitment>>();
  if (months <= 0) return out;

  const window = Array.from({ length: months }, (_, i) =>
    addMonths(fromMonth, i),
  );

  const add = (
    categoryId: string,
    month: string,
    cents: bigint,
    kind: keyof MonthCommitment,
  ) => {
    const byMonth = out.get(categoryId) ?? new Map<string, MonthCommitment>();
    const cur = byMonth.get(month) ?? { routine: 0n, onTop: 0n };
    byMonth.set(month, { ...cur, [kind]: cur[kind] + cents });
    out.set(categoryId, byMonth);
  };

  for (const rule of rules) {
    // A rule with no category cannot make any category short.
    if (!rule.category_id) continue;
    const amount = rule.amount_cents;
    if (amount <= 0n) continue;

    // A one-time payment is rare AND known — the same shape as a yearly
    // renewal, which is why it goes on TOP: November still has its ordinary
    // groceries underneath the sofa it is buying.
    if (rule.cadence === "ONCE") {
      const month = rule.next_due_date?.slice(0, 7);
      // No date, nothing to place: better absent than guessed into a month.
      if (!month) continue;
      if (window.includes(month)) add(rule.category_id, month, amount, "onTop");
      continue;
    }

    if (rule.cadence === "YEARLY") {
      // Without a named month there is nothing to place it in, and guessing
      // would put a five-figure charge in an arbitrary month.
      if (!rule.yearly_month || rule.yearly_month < 1 || rule.yearly_month > 12)
        continue;
      const mm = String(rule.yearly_month).padStart(2, "0");
      for (const month of window) {
        if (month.endsWith(`-${mm}`))
          add(rule.category_id, month, amount, "onTop");
      }
      continue;
    }

    const perMonth =
      rule.cadence === "MONTHLY"
        ? amount
        : rule.cadence === "WEEKLY"
          ? (amount * BigInt(Math.round(WEEKS_PER_MONTH * 1000)) + 500n) / 1000n
          : (amount * BigInt(Math.round(DAYS_PER_MONTH * 100)) + 50n) / 100n;
    for (const month of window)
      add(rule.category_id, month, perMonth, "routine");
  }

  return out;
}
