/**
 * reserve-rebalance.test.ts — the rules behind the rebalance dialog (260805).
 *
 * The dialog is a queue: every reserve that is short comes first, then the ones
 * sitting on money they do not need, then the ones already where they should be.
 * A row's button says what the ONE thing to do to it is, and "nothing" is a
 * legitimate answer that has to look different from "not done yet".
 */
import { describe, it, expect } from "vitest";
import {
  roundUpUnit,
  rebalanceBand,
  rebalancePct,
  rebalanceButton,
  rebalanceRowPct,
  sortRebalanceRows,
  parseTargetCents,
  type RebalanceRow,
} from "@/lib/reserve-rebalance";

const row = (over: Partial<RebalanceRow> = {}): RebalanceRow => ({
  categoryId: "c",
  name: "Category",
  currentCents: 0,
  targetCents: 0,
  baselineCents: null,
  ...over,
});

describe("rebalanceBand", () => {
  it("calls a reserve holding less than its target short", () => {
    expect(rebalanceBand(10_000, 50_000)).toBe("short");
  });

  it("calls a reserve holding more than its target surplus", () => {
    expect(rebalanceBand(50_000, 10_000)).toBe("surplus");
  });

  it("calls a reserve sitting exactly on its target even", () => {
    expect(rebalanceBand(50_000, 50_000)).toBe("even");
  });

  // Nothing held and nothing needed is DONE, not a surplus: the row should sink
  // to the bottom with the other settled ones.
  it("calls an empty reserve with nothing to hold even", () => {
    expect(rebalanceBand(0, 0)).toBe("even");
  });
});

describe("rebalancePct", () => {
  // The same signed percent the chart's bars are drawn from, so the row's colour
  // cannot drift from the bar's (user, 260805).
  it("reads the gap as a share of the target", () => {
    expect(rebalancePct(10_000, 50_000)).toBe(-80);
    expect(rebalancePct(60_000, 50_000)).toBe(20);
  });

  it("calls every zloty trimmable when the target is zero", () => {
    expect(rebalancePct(60_000, 0)).toBe(100);
  });

  it("is flat when there is nothing on either side", () => {
    expect(rebalancePct(0, 0)).toBe(0);
  });
});

/**
 * A row's colour and its button have to agree about whether there is anything
 * to do. Sport held 1,775.50 against a target of 1,776: the button was dead
 * because the move was under a whole unit, and the row stayed red, so the
 * dialog showed a problem it refused to fix (user screenshot, 260813).
 *
 * The answer is to make the move, not to hide the gap — the two sides end up
 * equal and stay equal.
 */
describe("rebalanceRowPct", () => {
  it("draws a sub-unit gap as the shortfall it is", () => {
    const stuck = row({ currentCents: 177_550, targetCents: 177_600 });
    expect(rebalanceButton(stuck)).toEqual({
      kind: "rebalance",
      disabled: false,
    });
    expect(rebalanceRowPct(stuck)).toBeLessThan(0);
  });

  it("goes level once the move has been made", () => {
    const done = row({ currentCents: 177_600, targetCents: 177_600 });
    expect(rebalanceRowPct(done)).toBe(0);
  });
});

describe("rebalanceButton", () => {
  it("offers the move while the amounts differ", () => {
    expect(
      rebalanceButton(row({ currentCents: 0, targetCents: 50_000 })),
    ).toEqual({
      kind: "rebalance",
      disabled: false,
    });
  });

  // "no action needed there" — the row is already right and nobody touched it,
  // so the button is visibly inert rather than absent (user, 260805).
  it("goes inert when the reserve is already on target and untouched", () => {
    expect(
      rebalanceButton(row({ currentCents: 50_000, targetCents: 50_000 })),
    ).toEqual({ kind: "rebalance", disabled: true });
  });

  it("offers the way back once the move has been made", () => {
    expect(
      rebalanceButton(
        row({ currentCents: 50_000, targetCents: 50_000, baselineCents: 0 }),
      ),
    ).toEqual({ kind: "undo", disabled: false });
  });

  // "If user change the target value and amounts differs — activate rebalance
  // button again": a fresh target outranks the undo, because the member is
  // asking for a new move rather than to take the old one back.
  it("offers the move again when a rebalanced row is given a new target", () => {
    expect(
      rebalanceButton(
        row({ currentCents: 50_000, targetCents: 80_000, baselineCents: 0 }),
      ),
    ).toEqual({ kind: "rebalance", disabled: false });
  });
});

describe("parseTargetCents", () => {
  // Both separators, because both keyboards are in use: the Polish layout's
  // decimal key is a comma and the field must not silently refuse it.
  it("takes a dot or a comma as the decimal point", () => {
    expect(parseTargetCents("1234.56")).toBe(123_456);
    expect(parseTargetCents("1234,56")).toBe(123_456);
  });

  it("ignores the grouping a pasted amount brings with it", () => {
    expect(parseTargetCents("1 234,56")).toBe(123_456);
  });

  // An emptied field is the member saying "hold nothing here", not a parse
  // failure — the row should offer to move the money out.
  it("reads an emptied field as nothing", () => {
    expect(parseTargetCents("")).toBe(0);
    expect(parseTargetCents("   ")).toBe(0);
  });

  // Mid-typing text keeps the last good target rather than jumping to zero.
  it("refuses half-typed and negative amounts", () => {
    expect(parseTargetCents("12.")).toBeNull();
    expect(parseTargetCents("-5")).toBeNull();
    expect(parseTargetCents("abc")).toBeNull();
  });
});

describe("sortRebalanceRows", () => {
  // Biggest difference first, whichever way it points (user, 260808). This
  // SUPERSEDES the short-then-fat-then-settled banding of 260805: a buffer
  // 80,000 over is a bigger thing to deal with than one 1,000 under, and the
  // limit dialog is ordered the same way so the two read alike.
  it("leads with the biggest move, whichever direction it goes", () => {
    const rows = [
      row({
        categoryId: "small-short",
        currentCents: 9_000,
        targetCents: 10_000,
      }),
      row({ categoryId: "big-fat", currentCents: 90_000, targetCents: 10_000 }),
      row({ categoryId: "big-short", currentCents: 0, targetCents: 80_000 }),
      row({
        categoryId: "small-fat",
        currentCents: 11_000,
        targetCents: 10_000,
      }),
    ];
    expect(sortRebalanceRows(rows).map((r) => r.categoryId)).toEqual([
      "big-fat",
      "big-short",
      "small-short",
      "small-fat",
    ]);
  });

  it("still leaves the settled rows last — their move is nothing", () => {
    const rows = [
      row({ categoryId: "even", currentCents: 10_000, targetCents: 10_000 }),
      row({ categoryId: "fat", currentCents: 90_000, targetCents: 10_000 }),
      row({ categoryId: "short", currentCents: 0, targetCents: 10_000 }),
    ];
    expect(sortRebalanceRows(rows).map((r) => r.categoryId)).toEqual([
      "fat",
      "short",
      "even",
    ]);
  });

  it("leaves the caller's list alone", () => {
    const rows = [
      row({ categoryId: "even", currentCents: 10_000, targetCents: 10_000 }),
      row({ categoryId: "short", currentCents: 0, targetCents: 10_000 }),
    ];
    sortRebalanceRows(rows);
    expect(rows.map((r) => r.categoryId)).toEqual(["even", "short"]);
  });

  // A rebalanced row lands on its target, so it re-files itself under the
  // settled ones the moment the move goes through.
  it("re-files a row the moment its amounts change", () => {
    const before = [
      row({ categoryId: "a", currentCents: 0, targetCents: 10_000 }),
      row({ categoryId: "b", currentCents: 0, targetCents: 5_000 }),
    ];
    expect(sortRebalanceRows(before).map((r) => r.categoryId)).toEqual([
      "a",
      "b",
    ]);
    const after = before.map((r) =>
      r.categoryId === "a"
        ? { ...r, currentCents: 10_000, baselineCents: 0 }
        : r,
    );
    expect(sortRebalanceRows(after).map((r) => r.categoryId)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("roundUpUnit", () => {
  // A reserve target of 661.63 is the walk's answer to the groszy; what the
  // member is asked to move is a whole figure (user, 260808). Up, not down, so
  // the buffer still covers what the history asked for.
  it("takes a part-unit up to the whole one", () => {
    expect(roundUpUnit(66163)).toBe(66200);
  });

  it("leaves a whole unit alone", () => {
    expect(roundUpUnit(66200)).toBe(66200);
  });

  it("leaves nothing as nothing", () => {
    expect(roundUpUnit(0)).toBe(0);
  });
});

describe("a difference under one unit is still an instruction", () => {
  // It used to go inert here: a reserve holding 1,720.01 against a target of
  // 1,720 was left one groszy off for ever, and the row went on reading as
  // mis-sized. Landing it exactly on the target is one press, and then both
  // sides agree — which is what the member asked for (260813).
  it("offers the groszy that makes the two sides equal", () => {
    expect(
      rebalanceButton(row({ currentCents: 172001, targetCents: 172000 })),
    ).toEqual({ kind: "rebalance", disabled: false });
  });

  it("still offers a real move", () => {
    expect(
      rebalanceButton(row({ currentCents: 172000, targetCents: 173000 })),
    ).toEqual({ kind: "rebalance", disabled: false });
  });

  // A move lands the reserve exactly ON its target, so that is where the undo
  // is offered. A row still a groszy off has not been moved yet.
  it("offers the undo once the row sits on its target", () => {
    expect(
      rebalanceButton(
        row({ currentCents: 172000, targetCents: 172000, baselineCents: 0 }),
      ),
    ).toEqual({ kind: "undo", disabled: false });
  });
});
