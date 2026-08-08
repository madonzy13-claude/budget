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
