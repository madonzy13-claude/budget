/**
 * reserve-fit-rows.ts — API rows → what the reserve-fit chart draws (260804).
 *
 * The bar is a signed percent of what the history asked for, so it reads like
 * "How far off plan": left of the line means the buffer is short, right means
 * money is sitting idle. One case a percent cannot express on its own:
 *
 *   needed 0, held > 0 → nothing to divide by, and every zloty is trimmable: +100
 *
 * There is deliberately NO "too little history" bucket. A category with two
 * months of history is judged on those two months — the member asked for the
 * number the data supports, not a row explaining what is missing (260804). The
 * server already drops categories with nothing at all to size.
 */
import type { ReserveFitRow } from "@/hooks/use-reserve-fit";

export interface SizedReserveRow {
  categoryId: string;
  name: string;
  /** Signed percent of `needed`; the chart clamps it for drawing. */
  pct: number;
  heldCents: number;
  neededCents: number;
  gapCents: number;
  short: boolean;
  worstMonth: string | null;
  worstOverageCents: number;
  overageMonths: number;
  monthsCounted: number;
  candidates: ReserveFitRow["large_transactions"];
}

export interface ReserveFitRowsResult {
  sized: SizedReserveRow[];
}

function toSized(r: ReserveFitRow): SizedReserveRow {
  const held = Number(r.held_cents);
  const needed = Number(r.needed_cents);
  const gap = Number(r.gap_cents);
  const pct = needed > 0 ? (gap / needed) * 100 : held > 0 ? 100 : 0;
  return {
    categoryId: r.category_id,
    name: r.name,
    pct,
    heldCents: held,
    neededCents: needed,
    gapCents: gap,
    short: gap < 0,
    worstMonth: r.worst_month,
    worstOverageCents: Number(r.worst_overage_cents),
    overageMonths: r.overage_months,
    monthsCounted: r.months_counted,
    // A payload cached before the list existed replays without the field.
    candidates: r.large_transactions ?? [],
  };
}

export function reserveFitRows(
  rows: readonly ReserveFitRow[],
): ReserveFitRowsResult {
  const sized = rows.map(toSized);
  // By PERCENT, not by amount (user, 260804): the bar IS a percentage, so a big
  // reserve that is 20% fat must not outrank a small one holding four times what
  // it needs. Ties — every "needs nothing" row is +100% — fall back to the money
  // at stake, which is what makes one of them worth acting on first.
  sized.sort((a, b) => b.pct - a.pct || b.gapCents - a.gapCents);
  return { sized };
}
