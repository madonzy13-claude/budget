/**
 * reserve-totals.ts — the three figures above the reserve-fit chart (260804).
 *
 * The chart says WHICH categories are mis-sized; these say how big the problem
 * is overall: what the budget holds, what its history asked for, and the slack
 * between them — the number a member acts on.
 *
 * The two sides cancel on purpose. A fat Car and an empty Food net out here,
 * because the question this strip answers is "is the budget over-reserved as a
 * whole"; the chart underneath is where you see which is which.
 */
import type { ReserveFitRow } from "@/hooks/use-reserve-fit";
import { isSettled } from "./reserve-fit-rows";

export interface ReserveTotals {
  heldCents: number;
  neededCents: number;
  /** held − needed. Negative = the history asked for more than is held. */
  slackCents: number;
}

const cents = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function reserveTotals(rows: readonly ReserveFitRow[]): ReserveTotals {
  let heldCents = 0;
  let neededCents = 0;
  for (const r of rows) {
    const held = cents(r.held_cents);
    const needed = cents(r.needed_cents);
    heldCents += held;
    // A row that is already the right size asks for exactly what it holds.
    //
    // Summing the raw requirement instead let every category's rounding residue
    // pile up into a verdict of its own: five reserves each a few groszy above
    // what their history asked for — because the rebalance dialog rounds every
    // target UP to a whole unit — read as "3 zł more than needed" across a
    // budget that had just been fully rebalanced (user, 260810). A deadband on
    // the TOTAL cannot fix that; the residues are individually tiny and only
    // the sum is large. So the total is built from the SETTLED figures, and the
    // slack that comes out is the sum of the gaps a member can actually close.
    neededCents += isSettled(held, needed) ? held : needed;
  }
  return { heldCents, neededCents, slackCents: heldCents - neededCents };
}
