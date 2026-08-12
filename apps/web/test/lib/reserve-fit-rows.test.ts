/**
 * reserve-fit-rows.test.ts — turning the API rows into what the chart draws.
 *
 * The bar is a signed percent like "How far off plan", but the interesting cases
 * are the ones a percent cannot express: a category that needs nothing while
 * holding money (no denominator), and a category with too little history to
 * judge at all.
 */
import { describe, it, expect } from "vitest";
import { reserveFitRows } from "../../src/lib/reserve-fit-rows";
import type { ReserveFitRow } from "../../src/hooks/use-reserve-fit";

const row = (over: Partial<ReserveFitRow> = {}): ReserveFitRow => ({
  category_id: "c1",
  name: "Food",
  held_cents: "5000",
  needed_cents: "10000",
  gap_cents: "-5000",
  worst_month: "2026-02",
  worst_overage_cents: "12000",
  overage_months: 2,
  months_counted: 12,
  large_transactions: [],
  ...over,
});

describe("reserveFitRows", () => {
  it("reads a short category as a negative percent of what it needs", () => {
    const [r] = reserveFitRows([row()]).sized;
    expect(r?.pct).toBe(-50); // holds 50, needs 100
    expect(r?.short).toBe(true);
  });

  it("reads an over-held category as a positive percent", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "15000", needed_cents: "10000", gap_cents: "5000" }),
    ]).sized;
    expect(r?.pct).toBe(50);
    expect(r?.short).toBe(false);
  });

  it("calls a category that needs NOTHING but holds money fully over", () => {
    // No denominator to divide by: every zloty of it is trimmable.
    const [r] = reserveFitRows([
      row({ held_cents: "46000", needed_cents: "0", gap_cents: "46000" }),
    ]).sized;
    expect(r?.pct).toBe(100);
  });

  it("calls a category that needs nothing and holds nothing settled", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "0", needed_cents: "0", gap_cents: "0" }),
    ]).sized;
    expect(r?.pct).toBe(0);
  });

  // 260804 (user): no "too little history to judge" bucket. A category with two
  // months of history is judged on those two months — the member wants the
  // number the data supports, not a row explaining that it is missing.
  it("sizes every category, however little history it has", () => {
    const { sized } = reserveFitRows([
      row({ months_counted: 1 }),
      row({ category_id: "c2", name: "Car", months_counted: 12 }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["Food", "Car"]);
  });

  // 260804 (user): order by PERCENT, not by amount — the bar is a percentage,
  // so a big category holding 20% too much must not outrank a small one holding
  // four times what it needs.
  it("runs from most short to most over-held, by percent", () => {
    const { sized } = reserveFitRows([
      // +25%: a large reserve, only slightly fat
      row({
        category_id: "a",
        name: "A",
        held_cents: "500000",
        needed_cents: "400000",
        gap_cents: "100000",
      }),
      // −50%
      row({
        category_id: "b",
        name: "B",
        held_cents: "5000",
        needed_cents: "10000",
        gap_cents: "-5000",
      }),
      // +300%: a small reserve, wildly fat
      row({
        category_id: "c",
        name: "C",
        held_cents: "4000",
        needed_cents: "1000",
        gap_cents: "3000",
      }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["B", "A", "C"]);
  });

  // 260804: reading the chart in zł must order it in zł too — otherwise the top
  // bar is not the longest one.
  it("orders by money when the chart is read in money", () => {
    const { sized } = reserveFitRows(
      [
        // +300% but only 3,000 at stake
        row({
          category_id: "c",
          name: "C",
          held_cents: "4000",
          needed_cents: "1000",
          gap_cents: "3000",
        }),
        // +25% and 100,000 at stake
        row({
          category_id: "a",
          name: "A",
          held_cents: "500000",
          needed_cents: "400000",
          gap_cents: "100000",
        }),
        row({
          category_id: "b",
          name: "B",
          held_cents: "5000",
          needed_cents: "10000",
          gap_cents: "-5000",
        }),
      ],
      "amount",
    );
    expect(sized.map((r) => r.name)).toEqual(["B", "C", "A"]);
  });

  // Either direction: the bigger gap leads, shortfall or surplus. Ordering the
  // tie by signed money would have put a 1,000 shortfall above a 90,000 one.
  it("breaks a percent tie on the size of the money at stake", () => {
    const { sized } = reserveFitRows([
      row({
        category_id: "a",
        name: "Small",
        held_cents: "1000",
        needed_cents: "0",
        gap_cents: "1000",
      }),
      row({
        category_id: "b",
        name: "Big",
        held_cents: "90000",
        needed_cents: "0",
        gap_cents: "90000",
      }),
    ]);
    expect(sized.map((r) => r.name)).toEqual(["Big", "Small"]);
  });

  it("survives a cached row from before the one-off list existed", () => {
    const stale = { ...row() } as Partial<ReserveFitRow>;
    delete stale.large_transactions;
    const { sized } = reserveFitRows([stale as ReserveFitRow]);
    expect(sized[0]?.candidates).toEqual([]);
  });
});

describe("reserveFitRows — the limit that would fund the buffer", () => {
  const base = {
    category_id: "c1",
    name: "Clothes",
    held_cents: "30000",
    needed_cents: "98200",
    gap_cents: "-68200",
    worst_month: "2026-03",
    worst_overage_cents: "156200",
    overage_months: 3,
    months_counted: 11,
    large_transactions: [],
  };

  it("carries the suggestion through to the row", () => {
    const [row] = reserveFitRows([
      {
        ...base,
        suggested_limit_cents: "23000",
        suggested_delta_cents: "8000",
        suggested_over_months: 2,
        suggested_direction: "raise",
      },
    ] as never).sized;
    expect(row!.suggestedLimitCents).toBe(23000);
    expect(row!.suggestedDeltaCents).toBe(8000);
    expect(row!.suggestedOverMonths).toBe(2);
    expect(row!.suggestedDirection).toBe("raise");
  });

  it("has no suggestion when the server sent none", () => {
    const [row] = reserveFitRows([
      {
        ...base,
        suggested_limit_cents: null,
        suggested_delta_cents: null,
        suggested_over_months: null,
        suggested_direction: null,
      },
    ] as never).sized;
    expect(row!.suggestedLimitCents).toBeNull();
    expect(row!.suggestedDirection).toBeNull();
  });

  it("survives a payload cached before the field existed", () => {
    // The offline cache replays yesterday's shape; a missing suggestion must
    // read as "nothing to say", not as NaN in a sentence.
    const [row] = reserveFitRows([base] as never).sized;
    expect(row!.suggestedLimitCents).toBeNull();
    expect(row!.suggestedDirection).toBeNull();
  });
});

/**
 * The basis is the limit in FORCE (user, 260809).
 *
 * A re-base onto the recommended limit was tried and reverted the same day: the
 * bar answers "where does this reserve stand", and the suggestion beside it
 * answers "where should it go". Two questions, two figures.
 */
describe("reserveFitRows — measured at the limit in force", () => {
  it("ignores what the buffer would need at the suggested limit", () => {
    const [r] = reserveFitRows([
      row({
        held_cents: "1731521",
        needed_cents: "942584",
        gap_cents: "788937",
        suggested_limit_cents: "266882",
        suggested_delta_cents: "-63118",
        suggested_needed_cents: "1871784",
      }),
    ]).sized;
    expect(r?.neededCents).toBe(942584);
    expect(r?.gapCents).toBe(788937);
    expect(r?.short).toBe(false);
    // …and it still carries the forecast, for the sentence under the bar.
    expect(r?.suggestedNeededCents).toBe(1871784);
  });

  it("is unchanged when the row recommends nothing", () => {
    const [r] = reserveFitRows([
      row({
        held_cents: "1731521",
        needed_cents: "942584",
        gap_cents: "788937",
        suggested_limit_cents: null,
        suggested_needed_cents: null,
      }),
    ]).sized;
    expect(r?.neededCents).toBe(942584);
    expect(r?.gapCents).toBe(788937);
  });
});

/**
 * The bars beside the same verdict. Presents held 506.00 against a history
 * asking 505.08 — the 0.92 is the rebalance dialog's own round-up, and it was
 * drawn as a "+1 zł" bar the member could not clear: the dialog will not offer
 * a move smaller than a whole unit (user screenshot, 260810).
 */
describe("reserveFitRows — a residue is not a discrepancy", () => {
  it("draws nothing for a category settled within a whole unit", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "50600", needed_cents: "50508", gap_cents: "92" }),
    ]).sized;
    expect(r?.gapCents).toBe(0);
    expect(r?.pct).toBe(0);
    expect(r?.short).toBe(false);
  });

  it("does the same when the residue is on the short side", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "177550", needed_cents: "177600", gap_cents: "-50" }),
    ]).sized;
    expect(r?.gapCents).toBe(0);
    expect(r?.short).toBe(false);
  });

  it("still draws a gap of one whole unit — the smallest real move", () => {
    const [r] = reserveFitRows([
      row({ held_cents: "50600", needed_cents: "50500", gap_cents: "100" }),
    ]).sized;
    expect(r?.gapCents).toBe(100);
    expect(r?.pct).toBeGreaterThan(0);
  });
});
