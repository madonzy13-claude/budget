/**
 * reserve-ledger.test.ts — TDD for the cumulative reserve-ledger calculator.
 *
 * The reserve a category "has" is a running balance derived from its whole
 * history: a manual base (Σ reserve adjustments) plus, month by month in
 * chronological order, the net reserve move:
 *   - underspend (surplus ≥ 0)  → grows the reserve by the surplus
 *   - overspend  (surplus < 0)  → depletes the reserve by the amount the
 *                                 category draws from reserve, which is capped
 *                                 at the REAL reserve money available that
 *                                 month (you cannot use reserve cash you do not
 *                                 actually hold). The uncovered remainder is
 *                                 real overspend, not reserve usage.
 *
 * Pure + path-dependent: editing any month re-derives everything downstream.
 */
import { describe, it, expect } from "bun:test";
import { computeReserveLedger } from "../../src/domain/reserve-ledger";

describe("computeReserveLedger", () => {
  it("with no months, the expected reserve equals the manual base", () => {
    const r = computeReserveLedger(10000n, []);
    expect(r.expectedReserveCents).toBe(10000n);
    expect(r.monthlyUsageCents).toEqual([]);
  });

  it("an underspent month grows the reserve by the surplus", () => {
    const r = computeReserveLedger(0n, [
      { surplusCents: 3000n, maxUsableCents: 0n },
    ]);
    expect(r.expectedReserveCents).toBe(3000n);
    expect(r.monthlyUsageCents).toEqual([0n]);
  });

  it("an overspent month depletes the reserve by the (uncapped) draw", () => {
    // overspend 2000, plenty of real reserve → draw the full 2000
    const r = computeReserveLedger(10000n, [
      { surplusCents: -2000n, maxUsableCents: 9999999n },
    ]);
    expect(r.expectedReserveCents).toBe(8000n);
    expect(r.monthlyUsageCents).toEqual([2000n]);
  });

  it("reserve draw is capped at the real reserve money available", () => {
    // User's scenario: €80,000 allocated, big overspend, but only €80 real cash.
    // Draw caps at €80 (8000c) → expected 8,000,000 − 8,000 = 7,992,000 (= €79,920).
    const r = computeReserveLedger(8_000_000n, [
      { surplusCents: -49_200n, maxUsableCents: 8_000n },
    ]);
    expect(r.expectedReserveCents).toBe(7_992_000n);
    expect(r.monthlyUsageCents).toEqual([8_000n]);
  });

  it("is cumulative and path-dependent across months", () => {
    // base 0; month1 underspend +5000 → 5000; month2 overspend 3000 (cap high)
    // → 2000; month3 underspend +1000 → 3000.
    const r = computeReserveLedger(0n, [
      { surplusCents: 5000n, maxUsableCents: 0n },
      { surplusCents: -3000n, maxUsableCents: 100000n },
      { surplusCents: 1000n, maxUsableCents: 0n },
    ]);
    expect(r.expectedReserveCents).toBe(3000n);
    expect(r.monthlyUsageCents).toEqual([0n, 3000n, 0n]);
  });

  it("a fully-covered overspend records zero real overspend usage beyond the cap", () => {
    // overspend 5000, real cap 1000 → usage 1000 (rest is real overspend)
    const r = computeReserveLedger(2000n, [
      { surplusCents: -5000n, maxUsableCents: 1000n },
    ]);
    expect(r.expectedReserveCents).toBe(1000n); // 2000 - 1000
    expect(r.monthlyUsageCents).toEqual([1000n]);
  });
});
