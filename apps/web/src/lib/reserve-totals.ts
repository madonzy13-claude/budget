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
import { roundUpUnit } from "./reserve-fit-rows";

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
    // What each reserve is ASKED to hold — the requirement rounded up to a
    // whole unit, exactly as the chart draws it and the dialog proposes it.
    //
    // Summing the raw groszy instead let every category's round-up pile into a
    // verdict of its own: five reserves a few groszy above their requirement
    // read as "3 zł more than needed" across a budget that had just been fully
    // rebalanced (user, 260810). Asking for the same figure the member is
    // offered makes that sum exactly zero, and every remaining zloty of slack
    // one somebody can close.
    const needed = roundUpUnit(cents(r.needed_cents));
    heldCents += held;
    neededCents += needed;
  }
  return { heldCents, neededCents, slackCents: heldCents - neededCents };
}
