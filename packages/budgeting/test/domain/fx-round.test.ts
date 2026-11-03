// convertCents — the TS twin of SQL budgeting.fx_convert's round(): half away
// from zero, so a refund mirrors a payment. money.ts sets the GLOBAL Big.RM to
// half-even; convertCents must not inherit it.
import { describe, test, expect } from "bun:test";
import "@budget/shared-kernel";
import { convertCents } from "../../src/domain/fx-round";

describe("convertCents", () => {
  test("rounds half away from zero for positive amounts", () => {
    expect(convertCents(1n, "0.5")).toBe(1n);
    expect(convertCents(3n, "0.5")).toBe(2n);
    expect(convertCents(5n, "0.5")).toBe(3n);
  });

  test("rounds half away from zero for negative amounts (refund mirrors)", () => {
    expect(convertCents(-1n, "0.5")).toBe(-1n);
    expect(convertCents(-3n, "0.5")).toBe(-2n);
    expect(convertCents(-5n, "0.5")).toBe(-3n);
  });

  test("ignores the global half-even rounding mode set by money.ts", () => {
    // Half-even would give 2n for 5n×0.5 (2.5 → 2); half-up gives 3n.
    expect(convertCents(5n, "0.5")).toBe(3n);
  });

  test("handles amounts beyond Number precision", () => {
    expect(convertCents(9_007_199_254_740_993n, "1")).toBe(9_007_199_254_740_993n);
  });
});
