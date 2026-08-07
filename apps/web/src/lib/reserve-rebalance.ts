/**
 * reserve-rebalance.ts — the rules the rebalance dialog runs on (260805).
 *
 * The chart says which buffers are the wrong size; this is where they are put
 * right. Each row carries three numbers — what the category HOLDS, what it
 * SHOULD hold (the history's answer, until the member types over it), and what
 * it held before the move, so the move can be taken back.
 *
 * Two decisions live here rather than in the component, because both are worth
 * a test on their own:
 *
 *   the ORDER   — short first, fat second, settled last. Deliberately not the
 *                 chart's ascending percent, which files the settled rows in
 *                 the middle: this list is a queue, so everything still to do
 *                 sits above everything already done (user, 260805).
 *   the BUTTON  — "move it", "put it back", or nothing to do at all. The third
 *                 has to be visible: a row that is already right must not look
 *                 like a row nobody has got to yet.
 */
// The row's colour has to be the bar's colour, so the percent behind it is the
// same one — held against needed, with the member's target standing in for
// needed once they change it.
export { fitPct as rebalancePct } from "./reserve-fit-rows";
import { fitPct } from "./reserve-fit-rows";
import { parseDecimal } from "./decimal";

export type RebalanceBand = "short" | "surplus" | "even";

export interface RebalanceRow {
  categoryId: string;
  name: string;
  /** What the category holds now — the engine's reserve, or the settled value
   *  a move in this dialog just returned. */
  currentCents: number;
  /** What it should hold: what the history asked for, until the member says
   *  otherwise. */
  targetCents: number;
  /** What it held before the FIRST move in this dialog; null while untouched.
   *  The first one is kept on purpose — undo returns you to where you started,
   *  not to the middle of a series of tries. */
  baselineCents: number | null;
}

export function rebalanceBand(
  currentCents: number,
  targetCents: number,
): RebalanceBand {
  if (currentCents === targetCents) return "even";
  return currentCents < targetCents ? "short" : "surplus";
}

export interface RebalanceButton {
  kind: "rebalance" | "undo";
  disabled: boolean;
}

export function rebalanceButton(row: RebalanceRow): RebalanceButton {
  // A new target outranks the undo: the member is asking for a different move,
  // not to take the last one back.
  if (row.currentCents !== row.targetCents)
    return { kind: "rebalance", disabled: false };
  if (row.baselineCents !== null) return { kind: "undo", disabled: false };
  return { kind: "rebalance", disabled: true };
}

const BAND_RANK: Record<RebalanceBand, number> = {
  short: 0,
  surplus: 1,
  even: 2,
};

export function sortRebalanceRows<
  T extends { currentCents: number; targetCents: number },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const band =
      BAND_RANK[rebalanceBand(a.currentCents, a.targetCents)] -
      BAND_RANK[rebalanceBand(b.currentCents, b.targetCents)];
    if (band !== 0) return band;
    // Inside a band, the bigger move first: a buffer 8,000 short is the one to
    // deal with before one that is 1,000 short.
    return (
      Math.abs(b.targetCents - b.currentCents) -
      Math.abs(a.targetCents - a.currentCents)
    );
  });
}

/**
 * A typed target as cents, or null when the text is not an amount yet — the
 * caller keeps the last good value so a half-typed "12." does not read as 12
 * zloty and then as nothing. An EMPTIED field is a real answer ("hold nothing
 * here"), not a failure, so it comes back as 0.
 */
export function parseTargetCents(text: string): number | null {
  if (text.trim() === "") return 0;
  return parseDecimal(text);
}

/** Re-exported so callers reading a row's colour do not need both modules. */
export function rebalanceRowPct(row: RebalanceRow): number {
  return fitPct(row.currentCents, row.targetCents);
}

/**
 * What the dialog may pre-fill as a reserve's target.
 *
 * `needed` changed meaning on 260807: it is what must be in the reserve TODAY,
 * and it explicitly nets out the accrual the limit will keep producing. That
 * makes it a FLOOR, not a target. Offering it as one would put a one-tap
 * withdrawal behind every healthy category — pulling out the money the accrual
 * assumption rests on, which the model cannot notice, because it never reads
 * what is held.
 *
 * So: top a short reserve UP to its floor, trim only what sits above the most
 * it could ever be called on to hold, and leave everything in between alone.
 * Money between the two is not idle — it is early.
 */
export function rebalanceTarget(
  heldCents: number,
  neededCents: number,
  ceilingCents: number,
): number {
  if (heldCents < neededCents) return neededCents;
  // A ceiling below the floor would invert the rule; the floor always wins.
  const ceiling = Math.max(ceilingCents, neededCents);
  if (heldCents > ceiling) return ceiling;
  return heldCents;
}
