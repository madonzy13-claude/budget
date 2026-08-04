/**
 * reserve-fit-rows.ts — API rows → what the reserve-fit chart draws (260804).
 *
 * The bar is a signed percent of what the history asked for, so it reads like
 * "How far off plan": left of the line means the buffer is short, right means
 * money is sitting idle. Two cases a percent cannot express on its own:
 *
 *   needed 0, held > 0 → nothing to divide by, and every zloty is trimmable: +100
 *   thin history       → set aside entirely. Three months of a category is not
 *                        evidence about its worst month, and a confident zero
 *                        would invite someone to empty a reserve they need.
 *                        Measured against the RANGE, though: on a 1M range every
 *                        row has one month, and that weak signal is exactly what
 *                        the member asked to see — setting them all aside would
 *                        leave an empty chart on every short range (260804).
 */
import type { ReserveFitRow } from "@/hooks/use-reserve-fit";

/** Below this many months in range, a category is listed, not sized. */
export const MIN_MONTHS = 3;

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
  /** Too little history to judge — shown as a note, never as a bar. */
  thin: SizedReserveRow[];
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
  // The longest history any category has is how much range there was to have.
  // A row with less than that (and less than MIN_MONTHS) is a NEW category, not
  // a short range.
  const rangeMonths = rows.reduce(
    (max, r) => Math.max(max, r.months_counted),
    0,
  );
  const floor = Math.min(MIN_MONTHS, rangeMonths);

  const sized: SizedReserveRow[] = [];
  const thin: SizedReserveRow[] = [];
  for (const r of rows) {
    const s = toSized(r);
    (s.monthsCounted >= floor ? sized : thin).push(s);
  }
  // Fattest reserve at the top, emptiest at the bottom (user, 260804): the bars
  // then form one continuous slope from "free this money" down to "this needs
  // money", instead of the two ends meeting in the middle.
  sized.sort((a, b) => b.gapCents - a.gapCents);
  return { sized, thin };
}
