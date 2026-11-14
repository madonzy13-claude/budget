/**
 * investment-smart-limit.test.ts — pure smart-limit math (RED phase, TDD).
 *
 * Smart limit for the Investments category = monthly income (in budget ccy)
 * minus the planned (needs+wants) of every OTHER active category, clamped ≥ 0.
 * needs/wants aren't stored separately — only planned = needs+wants — so
 * Σneeds + Σwants collapses to Σ planned. See get-spendings-summary injection.
 */
import { describe, test, expect } from "bun:test";
import {
  decimalToCents,
  normalizeIncomesToMonthlyItems,
} from "../../src/application/investment-smart-limit";

describe("decimalToCents", () => {
  test("whole numbers → cents", () => {
    expect(decimalToCents("5000")).toBe(500000n);
    expect(decimalToCents("0")).toBe(0n);
  });
  test("two decimals exact", () => {
    expect(decimalToCents("12.34")).toBe(1234n);
    expect(decimalToCents("1200.0000")).toBe(120000n);
  });
  test("rounds half-up beyond cents", () => {
    expect(decimalToCents("12.345")).toBe(1235n); // .5 → up
    expect(decimalToCents("12.344")).toBe(1234n);
    expect(decimalToCents("0.005")).toBe(1n);
  });
});

describe("normalizeIncomesToMonthlyItems", () => {
  test("normalizes each cadence to a monthly-cents item preserving currency", () => {
    const items = normalizeIncomesToMonthlyItems([
      { amount: "5000", currency: "USD", cadence: "MONTHLY" },
      { amount: "1200", currency: "USD", cadence: "YEARLY" },
      { amount: "100", currency: "EUR", cadence: "WEEKLY" },
    ]);
    expect(items).toEqual([
      { amount_cents: 500000n, currency: "USD" },
      { amount_cents: 10000n, currency: "USD" }, // 1200/12 = 100.00
      { amount_cents: 43450n, currency: "EUR" }, // 100 * 4.345
    ]);
  });
});
