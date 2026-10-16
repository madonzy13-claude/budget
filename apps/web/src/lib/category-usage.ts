/**
 * category-usage.ts — how much of a category's money is gone (user, 261016).
 *
 * The pool is what the category can ACTUALLY spend: its plan plus the reserve
 * still available to it. A category sitting at its limit with a full reserve
 * behind it is not in trouble, and a percent of the plan alone would say it
 * was.
 *
 * The percent is not capped. Past the pool it keeps counting, because "105%"
 * says how far past — a figure pinned at 100 would hide exactly the case worth
 * seeing.
 */
export type UsageTone = "ok" | "warn" | "bad";

export interface CategoryUsage {
  /** Whole percent of the pool used. May exceed 100. */
  pct: number;
  tone: UsageTone;
}

export function categoryUsage(i: {
  /** The limit in force — the cushion figure in a cushion month. */
  plannedCents: string;
  spentCents: string;
  reserveAvailableCents: string;
  /** 0083: unbounded categories cannot be overspent and have no pool. */
  noLimit?: boolean;
}): CategoryUsage | null {
  if (i.noLimit) return null;

  const planned = Number(i.plannedCents || "0");
  const reserve = Number(i.reserveAvailableCents || "0");
  const pool = planned + reserve;
  if (pool <= 0) return null;

  // A refund can push a month's spend below zero; that is "nothing used", not
  // a negative percentage.
  const spent = Math.max(0, Number(i.spentCents || "0"));

  return {
    pct: Math.round((spent / pool) * 100),
    tone: spent <= planned ? "ok" : spent <= pool ? "warn" : "bad",
  };
}
