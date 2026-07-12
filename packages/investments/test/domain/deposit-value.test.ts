import { describe, test, expect } from "bun:test";
import {
  computeDepositValueCents,
  computeDepositAccruedCents,
  type DepositInput,
} from "../../src/domain/deposit-value";

// Shared base: $1,000.00 principal.
const P = 100_000n;

function v(overrides: Partial<DepositInput>): number {
  return Number(
    computeDepositValueCents({
      principalCents: P,
      rateBps: 1200, // 12% / yr
      startDate: "2025-01-01",
      capFrequency: "monthly",
      asOf: "2025-01-01",
      ...overrides,
    }),
  );
}

describe("computeDepositValueCents", () => {
  describe("no accrual yet", () => {
    test("as-of == start returns principal", () => {
      expect(v({ asOf: "2025-01-01" })).toBe(100_000);
    });
    test("as-of before start returns principal", () => {
      expect(v({ asOf: "2024-06-01" })).toBe(100_000);
    });
    test("zero rate never accrues", () => {
      expect(v({ rateBps: 0, asOf: "2030-01-01" })).toBe(100_000);
    });
  });

  describe("partial period (daily creep before first capitalization)", () => {
    test("15 days into a monthly deposit at 12% (actual/365)", () => {
      // 100000 * (1 + 0.12*15/365) = 100493.15 -> 100493
      expect(v({ asOf: "2025-01-16" })).toBe(100_493);
    });
    test("value creeps up every single day", () => {
      const d10 = v({ asOf: "2025-01-11" });
      const d11 = v({ asOf: "2025-01-12" });
      expect(d11).toBeGreaterThan(d10);
    });
  });

  describe("capitalization boundary", () => {
    test("one full month folds in (Jan has 31 days)", () => {
      // 100000 * (1 + 0.12*31/365) = 101019.18 -> 101019
      expect(v({ asOf: "2025-02-01" })).toBe(101_019);
    });
    test("yearly on a leap year uses actual/365 (366 days)", () => {
      // 100000 * (1 + 0.10*366/365) = 110027.40 -> 110027
      expect(
        v({
          rateBps: 1000,
          capFrequency: "yearly",
          startDate: "2024-01-01",
          asOf: "2025-01-01",
        }),
      ).toBe(110_027);
    });
  });

  describe("daily capitalization (closed form)", () => {
    test("1 day at 36.5%/yr = +0.1%/day", () => {
      // 100000 * 1.001^1 = 100100
      expect(
        v({ rateBps: 3650, capFrequency: "daily", asOf: "2025-01-02" }),
      ).toBe(100_100);
    });
    test("2 days compounds daily", () => {
      // 100000 * 1.001^2 = 100200.1 -> 100200
      expect(
        v({ rateBps: 3650, capFrequency: "daily", asOf: "2025-01-03" }),
      ).toBe(100_200);
    });
  });

  describe("compounding never loses earnings", () => {
    test("value is monotonic non-decreasing across a capitalization", () => {
      const before = v({ asOf: "2025-01-31" }); // day before first cap
      const on = v({ asOf: "2025-02-01" }); // capitalization day
      const after = v({ asOf: "2025-02-02" }); // day after
      expect(on).toBeGreaterThanOrEqual(before);
      expect(after).toBeGreaterThan(on);
    });
    test("second month earns MORE per day than the first (interest on interest)", () => {
      const m1 = v({ asOf: "2025-02-01" }) - 100_000; // interest over 31 days
      const m2 = v({ asOf: "2025-03-01" }) - v({ asOf: "2025-02-01" }); // over 28 days
      expect(m2 / 28).toBeGreaterThan(m1 / 31);
    });
  });

  describe("maturity (end date) freezes the value", () => {
    test("value past end date equals value at end date", () => {
      const atEnd = v({ endDate: "2025-02-01", asOf: "2025-02-01" });
      const wayPast = v({ endDate: "2025-02-01", asOf: "2025-12-31" });
      expect(wayPast).toBe(atEnd);
      expect(atEnd).toBe(101_019);
    });
  });

  describe("computeDepositAccruedCents", () => {
    test("accrued = value - principal", () => {
      expect(
        computeDepositAccruedCents({
          principalCents: P,
          rateBps: 1200,
          startDate: "2025-01-01",
          capFrequency: "monthly",
          asOf: "2025-02-01",
        }),
      ).toBe("1019");
    });
  });
});
