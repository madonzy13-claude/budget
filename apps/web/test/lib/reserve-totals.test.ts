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
