/**
 * limit-rebalance.ts — the rules the LIMIT dialog runs on (260808).
 *
 * Sibling of reserve-rebalance.ts. The Future reading of "how much each limit
 * should change" names a new limit per category; acting on it writes a needs
 * and a wants figure, because that is what a limit is stored as. So a row
 * carries four numbers — what the two sides are now, and what each should
 * become — plus what they were before the first move, so it can be taken back.
 *
 * The split is PROPOSED rather than demanded: the walk knows what the limit
 * has to total, not which half of it is a need. Existing proportions are the
 * only honest guess, and the member edits from there.
 */

import { fitPct } from "./reserve-fit-rows";

export interface LimitSplit {
  needsCents: number;
  wantsCents: number;
}

export interface LimitRow {
  categoryId: string;
  name: string;
  /** What the category's limit is split into today. */
  needsCents: number;
  wantsCents: number;
  /** What it should become — the proposal, until the member types over it. */
  targetNeedsCents: number;
  targetWantsCents: number;
  /** The split before the FIRST move in this dialog; null while untouched.
   *  Undo returns you to where you started, not to the middle of a series. */
  baseline: LimitSplit | null;
}

/**
 * Split `totalCents` the way this category already splits its limit. A category
 * that never separated the two (wants 0) keeps everything on needs rather than
 * being handed a wants line by arithmetic, and the rounding goes to needs so
 * the two halves always add back up to the total asked for.
 */
export function proposeSplit(
  needsCents: number,
  wantsCents: number,
  totalCents: number,
): LimitSplit {
  const total = Math.max(0, Math.round(totalCents));
  const current = needsCents + wantsCents;
  if (current <= 0 || wantsCents <= 0)
    return { needsCents: total, wantsCents: 0 };
  const wants = Math.min(total, Math.round((total * wantsCents) / current));
  return { needsCents: total - wants, wantsCents: wants };
}

export interface LimitRebalanceButton {
  kind: "rebalance" | "undo";
  disabled: boolean;
}

/** How far this row's proposal is from where it stands — both sides counted. */
export function limitMoveSize(row: LimitRow): number {
  return (
    Math.abs(row.targetNeedsCents - row.needsCents) +
    Math.abs(row.targetWantsCents - row.wantsCents)
  );
}

export function limitRebalanceButton(row: LimitRow): LimitRebalanceButton {
  // A new target outranks the undo: the member is asking for a different move,
  // not to take the last one back.
  if (limitMoveSize(row) !== 0) return { kind: "rebalance", disabled: false };
  if (row.baseline !== null) return { kind: "undo", disabled: false };
  return { kind: "rebalance", disabled: true };
}

/** A queue: everything still to do above everything already done, biggest
 *  change first — the same ordering the reserve dialog uses. */
export function sortLimitRows<T extends LimitRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => limitMoveSize(b) - limitMoveSize(a));
}

/**
 * The row's colour, from the same function the reserve rows use so the two
 * dialogs cannot disagree about what red means: a limit that has to RISE is
 * under-budgeted, which is the shortfall colour, and one that can come down is
 * slack, which is amber. Today's total stands in for "held", the proposal for
 * "needed" (user, 260808).
 */
export function limitRowPct(row: LimitRow): number {
  return fitPct(
    row.needsCents + row.wantsCents,
    row.targetNeedsCents + row.targetWantsCents,
  );
}
