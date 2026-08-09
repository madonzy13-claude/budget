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
  /** The limit that would keep this category solvent across its whole runway,
   *  and what it costs or frees each month. null = nothing worth saying. */
  suggestedLimitCents: number | null;
  suggestedDeltaCents: number | null;
  /** What it would need at that limit; null when there is no suggestion. */
  suggestedNeededCents: number | null;
  suggestedOverMonths: number | null;
  suggestedDirection: "raise" | "lower" | null;
  candidates: ReserveFitRow["large_transactions"];
}

export interface ReserveFitRowsResult {
  sized: SizedReserveRow[];
}

/**
 * The signed percent a bar is drawn at: how far `held` is from `needed`, as a
 * share of `needed`. Exported because the rebalance dialog colours its rows
 * from the member's TARGET rather than from `needed` — same formula, different
 * denominator, and the two must never disagree about which colour a row is.
 */
export function fitPct(heldCents: number, neededCents: number): number {
  if (neededCents > 0) return ((heldCents - neededCents) / neededCents) * 100;
  return heldCents > 0 ? 100 : 0;
}

function toSized(r: ReserveFitRow): SizedReserveRow {
  const held = Number(r.held_cents);
  // Measured at the limit in FORCE — where this reserve actually stands today
  // (user, 260809). A re-base onto the recommended limit was tried and reverted
  // the same day: the bar answers "where am I", and the suggestion beside it
  // answers "where should I go".
  const needed = Number(r.needed_cents);
  const gap = Number(r.gap_cents);
  const pct = fitPct(held, needed);
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
    // A payload cached before the suggestion existed replays without these, and
    // a missing one must read as "nothing to say" rather than as NaN in a
    // sentence.
    suggestedLimitCents:
      r.suggested_limit_cents == null ? null : Number(r.suggested_limit_cents),
    suggestedDeltaCents:
      r.suggested_delta_cents == null ? null : Number(r.suggested_delta_cents),
    suggestedNeededCents:
      r.suggested_needed_cents == null
        ? null
        : Number(r.suggested_needed_cents),
    suggestedOverMonths: r.suggested_over_months ?? null,
    suggestedDirection: r.suggested_direction ?? null,
    // A payload cached before the list existed replays without the field.
    candidates: r.large_transactions ?? [],
  };
}

export function reserveFitRows(
  rows: readonly ReserveFitRow[],
  /** Order the bars the way the chart is being READ (260804): percent when the
   *  axis is percent, money when it is money — otherwise the top bar is not the
   *  longest one. */
  scale: "pct" | "amount" = "pct",
): ReserveFitRowsResult {
  const sized = rows.map(toSized);
  // Shortest first (260805): this list is a queue of things to do, and a buffer
  // that cannot cover its next charge outranks one sitting on money it does not
  // need. Reading it the other way round made the reader scroll past every
  // surplus to reach the one row that can actually fail.
  //
  // In percent: a big reserve that is 20% short must not outrank a small one
  // holding a quarter of what it needs. Ties — every "needs nothing" row is
  // +100% — fall back to the SIZE of the money at stake, in either direction:
  // whether the gap is a shortfall or a surplus, the larger one is the one
  // worth acting on first.
  sized.sort((a, b) =>
    scale === "amount"
      ? a.gapCents - b.gapCents
      : a.pct - b.pct || Math.abs(b.gapCents) - Math.abs(a.gapCents),
  );
  return { sized };
}
