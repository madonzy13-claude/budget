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
  rebalanceBand,
  rebalancePct,
  rebalanceButton,
  sortRebalanceRows,
  parseTargetCents,
  rebalanceTarget,
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

describe("rebalanceButton", () => {
  it("offers the move while the amounts differ", () => {
    expect(rebalanceButton(row({ currentCents: 0, targetCents: 50_000 }))).toEqual({
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
  // Red, then yellow, then grey (user, 260805) — deliberately NOT the chart's
  // straight ascending percent, which files the settled rows between the two.
  it("leads with the short reserves, then the fat ones, then the settled", () => {
    const rows = [
      row({ categoryId: "even", currentCents: 10_000, targetCents: 10_000 }),
      row({ categoryId: "fat", currentCents: 90_000, targetCents: 10_000 }),
      row({ categoryId: "short", currentCents: 0, targetCents: 10_000 }),
    ];
    expect(sortRebalanceRows(rows).map((r) => r.categoryId)).toEqual([
      "short",
      "fat",
      "even",
    ]);
  });

  it("puts the biggest move first inside each band", () => {
    const rows = [
      row({ categoryId: "small-short", currentCents: 9_000, targetCents: 10_000 }),
      row({ categoryId: "small-fat", currentCents: 11_000, targetCents: 10_000 }),
      row({ categoryId: "big-fat", currentCents: 90_000, targetCents: 10_000 }),
      row({ categoryId: "big-short", currentCents: 0, targetCents: 80_000 }),
    ];
    expect(sortRebalanceRows(rows).map((r) => r.categoryId)).toEqual([
      "big-short",
      "small-short",
      "big-fat",
      "small-fat",
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

describe("rebalanceTarget — what the dialog is allowed to move a reserve to", () => {
  // `needed` changed meaning on 260807: it is now what must be there TODAY,
  // and it explicitly nets out the accrual the limit will keep producing. It is
  // a FLOOR, not a target. Pre-filling it as the target would offer a one-tap
  // withdrawal of everything above it — pulling out the very money the accrual
  // assumption rests on, which the model cannot notice because it never reads
  // what is held (audit, 260807).
  it("tops a short reserve up to what it needs today", () => {
    expect(rebalanceTarget(3000, 8000, 20000)).toBe(8000);
  });

  it("leaves a reserve that is merely AHEAD of schedule alone", () => {
    // Between the floor and the ceiling the money is not idle, it is early.
    expect(rebalanceTarget(15000, 8000, 20000)).toBe(15000);
  });

  it("trims only what is above the most it could ever need", () => {
    expect(rebalanceTarget(26000, 8000, 20000)).toBe(20000);
  });

  it("never proposes a withdrawal on the strength of today's floor alone", () => {
    // The specific bad case: needed 0 because the limit funds everything, a
    // large reserve, and a real ceiling behind it.
    expect(rebalanceTarget(17315, 0, 28079)).toBe(17315);
  });

  it("a ceiling below the floor cannot invert the rule", () => {
    // Defensive: whatever the inputs, the answer stays between them.
    const t = rebalanceTarget(10000, 9000, 5000);
    expect(t).toBeGreaterThanOrEqual(Math.min(9000, 10000));
  });
});
