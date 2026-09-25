/**
 * limit-rebalance.test.ts — the rules behind the limit dialog (260808).
 *
 * The Future reading of "how much each limit should change" says what each
 * category's limit ought to become. Acting on it means writing a needs/wants
 * SPLIT, not one number, so the dialog proposes a split and lets the member
 * move the line between the two before committing.
 */
import { describe, it, expect } from "vitest";
import {
  limitMoveSize,
  limitRebalanceButton,
  proposeSplit,
  sortLimitRows,
  type LimitRow,
} from "../../src/lib/limit-rebalance";

const row = (over: Partial<LimitRow> = {}): LimitRow => ({
  categoryId: "c1",
  name: "Car",
  needsCents: 60000,
  wantsCents: 40000,
  targetNeedsCents: 60000,
  targetWantsCents: 40000,
  baseline: null,
  ...over,
});

describe("proposeSplit", () => {
  it("keeps the existing needs/wants proportions", () => {
    // 600/400 is 60/40, and a limit of 1,500 keeps it: 900 and 600.
    expect(proposeSplit(60000, 40000, 150000)).toEqual({
      needsCents: 90000,
      wantsCents: 60000,
    });
  });

  // Nobody sets a limit of 3,129.90 (user, 260808). The walk answers to the
  // groszy; a limit is a decision, and it is made in whole złoty.
  it("proposes whole units, never a decimal", () => {
    const s = proposeSplit(100000, 0, 312990);
    expect(s.needsCents % 100).toBe(0);
    expect(s.wantsCents % 100).toBe(0);
  });

  it("rounds UP, so the limit still covers what the walk asked for", () => {
    expect(proposeSplit(100000, 0, 312990).needsCents).toBe(313000);
  });

  it("keeps BOTH sides whole and still summing to the rounded total", () => {
    const s = proposeSplit(10033, 20067, 100001);
    expect(s.needsCents % 100).toBe(0);
    expect(s.wantsCents % 100).toBe(0);
    expect(s.needsCents + s.wantsCents).toBe(100100);
  });

  it("puts every złoty on needs when nothing was ever split", () => {
    // needs = planned, wants = 0 is the pre-split default, and a category that
    // never separated the two should not be handed a wants line by a rounding.
    expect(proposeSplit(100000, 0, 120000)).toEqual({
      needsCents: 120000,
      wantsCents: 0,
    });
  });

  it("puts it on needs when the whole limit was zero", () => {
    // Nothing to take a proportion OF — 0/0 is not a ratio.
    expect(proposeSplit(0, 0, 50000)).toEqual({
      needsCents: 50000,
      wantsCents: 0,
    });
  });

  it("gives the rounding to needs so the two always make the target", () => {
    // A third of 1,001 cannot be split evenly; the halves must still sum.
    const s = proposeSplit(100, 200, 100100);
    expect(s.needsCents + s.wantsCents).toBe(100100);
  });

  it("never proposes a negative side", () => {
    const s = proposeSplit(60000, 40000, 0);
    expect(s).toEqual({ needsCents: 0, wantsCents: 0 });
  });
});

describe("limitRebalanceButton", () => {
  it("offers the move while the target differs", () => {
    expect(limitRebalanceButton(row({ targetNeedsCents: 70000 }))).toEqual({
      kind: "rebalance",
      disabled: false,
    });
  });

  it("offers it when only the WANTS side differs", () => {
    expect(limitRebalanceButton(row({ targetWantsCents: 10 }))).toEqual({
      kind: "rebalance",
      disabled: false,
    });
  });

  it("offers to undo once a move has been made", () => {
    expect(
      limitRebalanceButton(
        row({ baseline: { needsCents: 50000, wantsCents: 50000 } }),
      ),
    ).toEqual({ kind: "undo", disabled: false });
  });

  // With whole-unit proposals a limit sitting on 1,000.40 against a proposed
  // 1,000 is not something to act on — the same rule the reserve tooltip runs.
  it("goes inert when the difference is under a whole unit", () => {
    expect(
      limitRebalanceButton(row({ needsCents: 60040, targetNeedsCents: 60000 })),
    ).toEqual({ kind: "rebalance", disabled: true });
  });

  it("goes inert on a limit that is already what it should be", () => {
    // "Nothing to do here" has to look different from "not done yet" — the
    // same rule the reserve dialog runs on.
    expect(limitRebalanceButton(row())).toEqual({
      kind: "rebalance",
      disabled: true,
    });
  });

  it("lets a new target outrank the undo", () => {
    // The member is asking for a DIFFERENT move, not to take the last one back.
    expect(
      limitRebalanceButton(
        row({
          targetNeedsCents: 12345,
          baseline: { needsCents: 50000, wantsCents: 50000 },
        }),
      ),
    ).toEqual({ kind: "rebalance", disabled: false });
  });
});

describe("sortLimitRows", () => {
  it("puts the biggest change first and the settled rows last", () => {
    const rows = [
      row({ categoryId: "settled" }),
      row({ categoryId: "small", targetNeedsCents: 61000 }),
      row({ categoryId: "big", targetNeedsCents: 100000 }),
    ];
    expect(sortLimitRows(rows).map((r) => r.categoryId)).toEqual([
      "big",
      "small",
      "settled",
    ]);
  });

  it("weighs both sides of the split", () => {
    const rows = [
      row({ categoryId: "needsOnly", targetNeedsCents: 65000 }),
      row({
        categoryId: "both",
        targetNeedsCents: 63000,
        targetWantsCents: 45000,
      }),
    ];
    expect(sortLimitRows(rows)[0]!.categoryId).toBe("both");
  });
});

/**
 * A gap the Future chart calls nothing must not become a move in the dialog
 * that opens from it (user, 260925).
 *
 * The chart zeroes a gap under one whole unit before it draws — "a limit is set
 * in whole units, and the dialog proposes whole ones, so what a rebalance
 * leaves behind is a few groszy of rounding, which is nothing to act on"
 * (planned-section.tsx). The dialog rounded the TARGET up first and then asked
 * whether the move was worth making, so the rounding itself cleared the bar:
 * Food & Home, live on 260925, projected 103.53 against a limit of 103. The
 * chart drew 0 zł. The dialog offered 104 — a whole złoty conjured out of 53
 * groszy, on a row the chart said was settled.
 *
 * The test for "is this worth doing" has to run on the RAW gap, the same figure
 * the chart tests. Rounding up is for a move already worth making.
 */
describe("a sub-unit gap is not a move", () => {
  it("proposes no change when the projection is under a whole unit away", () => {
    // Food & Home, live: 103 held, 103.53 projected.
    expect(proposeSplit(10300, 0, 10353)).toEqual({
      needsCents: 10300,
      wantsCents: 0,
    });
  });

  it("leaves the button inert on such a row, as the chart leaves the bar at 0", () => {
    const split = proposeSplit(10300, 0, 10353);
    const row: LimitRow = {
      categoryId: "c1",
      name: "Food & Home",
      needsCents: 10300,
      wantsCents: 0,
      targetNeedsCents: split.needsCents,
      targetWantsCents: split.wantsCents,
      baseline: null,
    };
    expect(limitMoveSize(row)).toBe(0);
    expect(limitRebalanceButton(row)).toEqual({
      kind: "rebalance",
      disabled: true,
    });
  });

  it("still rounds up once the move IS worth making", () => {
    // Entertainment, live: 159 held (46 needs / 113 wants), 168.96 projected.
    expect(proposeSplit(4600, 11300, 16896)).toEqual({
      needsCents: 4900,
      wantsCents: 12000,
    });
  });
});
