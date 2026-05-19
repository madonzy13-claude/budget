/**
 * reserve-allocator.test.ts — Pure-function domain helpers for reserve actual mutation.
 *
 * Architecture pivot (UAT-PH5-T3-54): actual is stored per category. No read-time
 * walk, no timestamp sorting. Only these events mutate actual:
 *   - applyExpectedChange: user sets new expected target on one category.
 *   - applyWalletDelta:    user edits a RESERVE wallet balance up/down.
 *   - applyExclude:        user excludes a category (release to pool, refill siblings).
 *
 * Refill order = sortIndex ASC (display top → bottom).
 * Deduct order = sortIndex DESC (bottom → top).
 * Overflow (positive remainder) stays in wallet; banner shows "wallet has more".
 */
import { describe, test, expect } from "bun:test";
import {
  refillUnderfunded,
  deductFromBottom,
  applyExpectedChange,
  applyExclude,
  applyWalletDelta,
  type ReserveRow,
} from "../../src/domain/reserve-allocator";

function row(
  id: string,
  sortIndex: number,
  expected: bigint,
  actual: bigint,
  excluded = false,
): ReserveRow {
  return {
    categoryId: id,
    sortIndex,
    reserveExcluded: excluded,
    expectedCents: expected,
    actualCents: actual,
  };
}

describe("refillUnderfunded", () => {
  test("fills underfunded rows in sortIndex ASC, leaves fully-funded alone", () => {
    const rows = [
      row("A", 1, 100n, 50n),
      row("B", 2, 200n, 200n),
      row("C", 3, 50n, 0n),
    ];
    const r = refillUnderfunded(rows, 80n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(200n);
    expect(r.rows.find((x) => x.categoryId === "C")!.actualCents).toBe(30n);
    expect(r.overflowCents).toBe(0n);
  });

  test("returns overflow when all rows fully funded", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 50n, 50n)];
    const r = refillUnderfunded(rows, 30n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(50n);
    expect(r.overflowCents).toBe(30n);
  });

  test("skips excluded rows", () => {
    const rows = [row("X", 1, 0n, 0n, true), row("B", 2, 100n, 0n)];
    const r = refillUnderfunded(rows, 60n);
    expect(r.rows.find((x) => x.categoryId === "X")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(60n);
    expect(r.overflowCents).toBe(0n);
  });

  test("walks by sortIndex, not input array order", () => {
    const rows = [row("B", 2, 100n, 0n), row("A", 1, 80n, 0n)];
    const r = refillUnderfunded(rows, 50n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(50n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.overflowCents).toBe(0n);
  });

  test("preserves input row order in output", () => {
    const rows = [row("B", 2, 100n, 0n), row("A", 1, 80n, 0n)];
    const r = refillUnderfunded(rows, 200n);
    expect(r.rows.map((x) => x.categoryId)).toEqual(["B", "A"]);
  });

  test("zero available is no-op", () => {
    const rows = [row("A", 1, 100n, 50n)];
    const r = refillUnderfunded(rows, 0n);
    expect(r.rows[0].actualCents).toBe(50n);
    expect(r.overflowCents).toBe(0n);
  });
});

describe("deductFromBottom", () => {
  test("removes amount from bottom row first", () => {
    const rows = [
      row("A", 1, 100n, 100n),
      row("B", 2, 100n, 100n),
      row("C", 3, 100n, 100n),
    ];
    const r = deductFromBottom(rows, 150n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(50n);
    expect(r.rows.find((x) => x.categoryId === "C")!.actualCents).toBe(0n);
    expect(r.unsatisfiedCents).toBe(0n);
  });

  test("skips excluded rows", () => {
    const rows = [
      row("A", 1, 100n, 100n),
      row("X", 2, 0n, 0n, true),
      row("C", 3, 100n, 100n),
    ];
    const r = deductFromBottom(rows, 80n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "X")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "C")!.actualCents).toBe(20n);
    expect(r.unsatisfiedCents).toBe(0n);
  });

  test("returns unsatisfied when totalActual < amount", () => {
    const rows = [row("A", 1, 100n, 10n), row("B", 2, 100n, 5n)];
    const r = deductFromBottom(rows, 50n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.unsatisfiedCents).toBe(35n);
  });

  test("zero amount is no-op", () => {
    const rows = [row("A", 1, 100n, 100n)];
    const r = deductFromBottom(rows, 0n);
    expect(r.rows[0].actualCents).toBe(100n);
    expect(r.unsatisfiedCents).toBe(0n);
  });
});

describe("applyExpectedChange", () => {
  test("user scenario T3-54: pool=17, H=2, G=9, then G→25 leaves H untouched", () => {
    // Starting state: H sort=1 expected=2 actual=2; G sort=2 expected=9 actual=9.
    // Wallet pool = 17. Free pool = 17 - (2+9) = 6.
    // User sets G expected target to 25. Deficit after = 25 - 9 = 16; free = 6.
    // G.actual = 9 + min(16,6) = 15. H untouched.
    const rows = [row("H", 1, 200n, 200n), row("G", 2, 900n, 900n)];
    const r = applyExpectedChange(rows, 1700n, "G", 2500n);
    expect(r.rows.find((x) => x.categoryId === "H")!.actualCents).toBe(200n);
    expect(r.rows.find((x) => x.categoryId === "H")!.expectedCents).toBe(200n);
    expect(r.rows.find((x) => x.categoryId === "G")!.actualCents).toBe(1500n);
    expect(r.rows.find((x) => x.categoryId === "G")!.expectedCents).toBe(2500n);
  });

  test("raise expected within free pool: actual catches up fully", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 50n, 50n)];
    // walletPool=200; free=50
    const r = applyExpectedChange(rows, 200n, "B", 80n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(80n);
    expect(r.rows.find((x) => x.categoryId === "B")!.expectedCents).toBe(80n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
  });

  test("lower expected below actual: clamp actual, refill siblings", () => {
    // A under-funded (actual<expected), B fully funded. Lowering B's expected
    // releases the excess actual to A.
    const rows = [row("A", 1, 100n, 50n), row("B", 2, 200n, 200n)];
    // walletPool=250; free=0
    const r = applyExpectedChange(rows, 250n, "B", 100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.expectedCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(100n); // clamped
    // freed = 200-100 = 100. A deficit = 50. Fill 50. Overflow = 50.
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.overflowCents).toBe(50n);
  });

  test("lower expected below actual with no other underfunded: full overflow", () => {
    const rows = [row("A", 1, 50n, 50n), row("B", 2, 200n, 200n)];
    const r = applyExpectedChange(rows, 250n, "B", 100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(50n);
    expect(r.overflowCents).toBe(100n);
  });

  test("same expected: no-op", () => {
    const rows = [row("A", 1, 100n, 100n)];
    const r = applyExpectedChange(rows, 100n, "A", 100n);
    expect(r.rows[0].actualCents).toBe(100n);
    expect(r.rows[0].expectedCents).toBe(100n);
    expect(r.overflowCents).toBe(0n);
  });

  test("raise expected when category is excluded throws", () => {
    const rows = [row("X", 1, 0n, 0n, true)];
    expect(() => applyExpectedChange(rows, 100n, "X", 50n)).toThrow();
  });

  test("unknown categoryId throws", () => {
    const rows = [row("A", 1, 100n, 100n)];
    expect(() => applyExpectedChange(rows, 100n, "Z", 50n)).toThrow();
  });

  test("raise expected with no free pool: actual unchanged", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 100n, 100n)];
    // walletPool=200; free=0
    const r = applyExpectedChange(rows, 200n, "B", 150n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.expectedCents).toBe(150n);
  });
});

describe("applyExclude", () => {
  test("zeros actual and refills siblings in sortIndex ASC", () => {
    const rows = [row("A", 1, 100n, 50n), row("B", 2, 200n, 200n)];
    // walletPool=250 unused in this helper (no funding from pool, just redistribution)
    const r = applyExclude(rows, "B");
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "B")!.reserveExcluded).toBe(
      true,
    );
    // freed=200; A deficit=50; fill 50; overflow=150
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.overflowCents).toBe(150n);
  });

  test("excluding category with zero actual is no-op", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 50n, 0n)];
    const r = applyExclude(rows, "B");
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "B")!.reserveExcluded).toBe(
      true,
    );
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.overflowCents).toBe(0n);
  });

  test("excluding fully-funded with no other underfunded: full overflow", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 200n, 200n)];
    const r = applyExclude(rows, "B");
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.overflowCents).toBe(200n);
  });

  test("excluding already-excluded throws", () => {
    const rows = [row("X", 1, 0n, 0n, true)];
    expect(() => applyExclude(rows, "X")).toThrow();
  });

  test("unknown categoryId throws", () => {
    const rows = [row("A", 1, 100n, 100n)];
    expect(() => applyExclude(rows, "Z")).toThrow();
  });
});

describe("applyWalletDelta", () => {
  test("positive delta refills underfunded top→bottom", () => {
    const rows = [row("A", 1, 100n, 50n), row("B", 2, 200n, 100n)];
    // oldPool=150 (matches Σactual). delta=+100 → newPool=250.
    const r = applyWalletDelta(rows, 150n, 250n);
    // available=100; A deficit=50 → 100; B deficit=100 → fill 50 → 150.
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(150n);
    expect(r.overflowCents).toBe(0n);
  });

  test("positive delta with all funded becomes overflow", () => {
    const rows = [row("A", 1, 100n, 100n)];
    const r = applyWalletDelta(rows, 100n, 150n);
    expect(r.rows[0].actualCents).toBe(100n);
    expect(r.overflowCents).toBe(50n);
  });

  test("negative delta deducts bottom→top when Σactual > newPool", () => {
    const rows = [row("A", 1, 100n, 100n), row("B", 2, 100n, 100n)];
    // oldPool=200, newPool=130 → removal = 200-130 = 70.
    const r = applyWalletDelta(rows, 200n, 130n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(100n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(30n);
  });

  test("negative delta with slack: no deduction needed", () => {
    const rows = [row("A", 1, 100n, 30n)];
    // Σactual=30, newPool=50 → no removal needed.
    const r = applyWalletDelta(rows, 100n, 50n);
    expect(r.rows[0].actualCents).toBe(30n);
  });

  test("negative delta exhausting bottom cascades upward", () => {
    const rows = [
      row("A", 1, 100n, 100n),
      row("B", 2, 100n, 100n),
      row("C", 3, 100n, 100n),
    ];
    // oldPool=300, newPool=80 → removal = 220.
    // C: 100 → 0 (took 100). B: 100 → 0 (took 100). A: 100 → 80 (took 20).
    const r = applyWalletDelta(rows, 300n, 80n);
    expect(r.rows.find((x) => x.categoryId === "A")!.actualCents).toBe(80n);
    expect(r.rows.find((x) => x.categoryId === "B")!.actualCents).toBe(0n);
    expect(r.rows.find((x) => x.categoryId === "C")!.actualCents).toBe(0n);
  });

  test("zero delta no-op", () => {
    const rows = [row("A", 1, 100n, 50n)];
    const r = applyWalletDelta(rows, 100n, 100n);
    expect(r.rows[0].actualCents).toBe(50n);
    expect(r.overflowCents).toBe(0n);
  });
});
