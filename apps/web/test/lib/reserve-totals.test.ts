/**
 * reserve-totals.test.ts — the three figures above the reserve-fit chart.
 *
 * The chart says which categories are off; these say the size of the problem:
 * what the budget holds in total, what its history asked for, and the slack
 * between them — the number you act on (user, 260804).
 */
import { describe, it, expect } from "vitest";
import { reserveTotals } from "../../src/lib/reserve-totals";
import type { ReserveFitRow } from "../../src/hooks/use-reserve-fit";

const row = (held: string, needed: string): ReserveFitRow => ({
  category_id: `c-${held}-${needed}`,
  name: "Cat",
  held_cents: held,
  needed_cents: needed,
  gap_cents: String(Number(held) - Number(needed)),
  worst_month: null,
  worst_overage_cents: "0",
  overage_months: 0,
  months_counted: 12,
  large_transactions: [],
});

describe("reserveTotals", () => {
  it("adds up what is held and what the history asked for", () => {
    const t = reserveTotals([row("500000", "300000"), row("100000", "50000")]);
    expect(t.heldCents).toBe(600000);
    expect(t.neededCents).toBe(350000);
  });

  it("reports the slack between them", () => {
    expect(reserveTotals([row("500000", "300000")]).slackCents).toBe(200000);
  });

  it("reports a shortfall as negative slack", () => {
    expect(reserveTotals([row("100000", "300000")]).slackCents).toBe(-200000);
  });

  it("nets a short category against a fat one", () => {
    // The strip answers "is the budget over-reserved overall", so the two sides
    // cancel — the CHART is where you see which category is which.
    expect(
      reserveTotals([row("500000", "300000"), row("0", "100000")]).slackCents,
    ).toBe(100000);
  });

  it("is all zeros when there is nothing to size", () => {
    expect(reserveTotals([])).toEqual({
      heldCents: 0,
      neededCents: 0,
      slackCents: 0,
    });
  });

  it("ignores a row it cannot read", () => {
    const broken = { ...row("100000", "50000"), held_cents: "not-a-number" };
    expect(reserveTotals([broken]).heldCents).toBe(0);
  });
});

/**
 * Rebalancing every reserve and still being told you are 3 zł over (user
 * screenshot, 260810).
 *
 * The dialog rounds each target UP to a whole unit on purpose — nobody is asked
 * to move 505.08 — so a category whose history wants 505.08 settles at 506.00
 * and keeps a 0.92 residue for ever. One residue is invisible; five of them add
 * up to a verdict the member cannot clear, because the same dialog refuses to
 * offer a move under a whole unit.
 *
 * These are that member's real figures.
 */
describe("reserveTotals — what rounding up left behind", () => {
  const settled = [
    row("89400", "89372"), // Uncategorized  +0.28
    row("1061500", "1061450"), // Car            +0.50
    row("57300", "57240"), // Entertainment  +0.60
    row("135700", "135632"), // Travel         +0.68
    row("50600", "50508"), // Presents       +0.92
    row("177550", "177550"), // Sport          exact
  ];

  it("calls a fully-rebalanced budget settled", () => {
    expect(reserveTotals(settled).slackCents).toBe(0);
  });

  it("asks for exactly what is held, so the two headline figures agree", () => {
    const t = reserveTotals(settled);
    expect(t.neededCents).toBe(t.heldCents);
  });

  it("still reports a gap worth acting on", () => {
    // One whole unit is the smallest move the dialog will offer, so it counts.
    expect(reserveTotals([row("50600", "50500")]).slackCents).toBe(100);
    expect(reserveTotals([row("50400", "50500")]).slackCents).toBe(-100);
  });

  it("does not let sub-unit residue mask a real shortfall elsewhere", () => {
    // Presents is settled; Food is 200 zł short. The verdict is Food's.
    expect(
      reserveTotals([row("50600", "50508"), row("0", "20000")]).slackCents,
    ).toBe(-20000);
  });
});
