/**
 * recurring-monthly-normalize.test.ts — RED (11-04 Task 1).
 *
 * Pure 4-cadence → monthly-cents normalizer (Pitfall 2: recurring_rules CHECK
 * allows DAILY/WEEKLY/MONTHLY/YEARLY — all four must be handled).
 *   DAILY   → round(cents × 30.44)
 *   WEEKLY  → round(cents × 4.345)
 *   MONTHLY → cents
 *   YEARLY  → round(cents ÷ 12)
 */
import { describe, test, expect } from "bun:test";
import { recurringMonthlyNormalize } from "@budget/budgeting/src/application/recurring-monthly-normalize";

describe("recurringMonthlyNormalize", () => {
  test("DAILY multiplies by the average days-per-month (30.44)", () => {
    expect(recurringMonthlyNormalize(10000n, "DAILY")).toBe(304400n);
  });
  test("WEEKLY multiplies by the average weeks-per-month (4.345)", () => {
    expect(recurringMonthlyNormalize(10000n, "WEEKLY")).toBe(43450n);
  });
  test("MONTHLY is identity", () => {
    expect(recurringMonthlyNormalize(10000n, "MONTHLY")).toBe(10000n);
  });
  test("YEARLY divides by 12 (rounded)", () => {
    expect(recurringMonthlyNormalize(120000n, "YEARLY")).toBe(10000n);
  });
  test("YEARLY rounds to nearest cent", () => {
    // 100_00 / 12 = 833.33 → 833 cents
    expect(recurringMonthlyNormalize(10000n, "YEARLY")).toBe(833n);
  });
});
