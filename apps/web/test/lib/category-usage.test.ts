/**
 * category-usage.test.ts — how much of a category's money is gone
 * (user, 261016).
 *
 * The pool is what the category can actually spend: its plan PLUS the reserve
 * still available to it. Green while the plan covers it, amber once it is
 * eating the reserve, red past the pool — and the percent keeps counting past
 * 100, because 105% says how far past, where a capped figure would just sit
 * at the ceiling.
 */
import { describe, it, expect } from "vitest";
import { categoryUsage } from "@/lib/category-usage";

const u = (
  planned: number,
  spent: number,
  reserveAvailable: number,
  noLimit = false,
) =>
  categoryUsage({
    plannedCents: String(planned),
    spentCents: String(spent),
    reserveAvailableCents: String(reserveAvailable),
    noLimit,
  });

describe("categoryUsage", () => {
  it("counts the reserve as part of the pool", () => {
    // 620 of (1,100 + 300) = 44%
    expect(u(110_000, 62_000, 30_000)).toEqual({ pct: 44, tone: "ok" });
  });

  it("stays green while the plan alone covers the spend", () => {
    expect(u(110_000, 110_000, 30_000)?.tone).toBe("ok");
  });

  it("turns amber the moment it eats into the reserve", () => {
    expect(u(110_000, 110_001, 30_000)?.tone).toBe("warn");
  });

  it("stays amber to the very edge of the pool", () => {
    expect(u(110_000, 140_000, 30_000)).toEqual({ pct: 100, tone: "warn" });
  });

  it("turns red past the pool, and keeps counting", () => {
    // 147,000 of 140,000 = 105%
    expect(u(110_000, 147_000, 30_000)).toEqual({ pct: 105, tone: "bad" });
  });

  it("says nothing for a category that cannot be overspent", () => {
    expect(u(110_000, 62_000, 30_000, true)).toBeNull();
  });

  it("says nothing when there is no pool to be a fraction of", () => {
    expect(u(0, 0, 0)).toBeNull();
  });

  it("reads a reserve-only category against its reserve", () => {
    // No plan, 300 of reserve, 150 spent → half the pool, and it is past the
    // (zero) plan, so it is already drawing on the reserve.
    expect(u(0, 15_000, 30_000)).toEqual({ pct: 50, tone: "warn" });
  });

  it("rounds to whole percent", () => {
    // 1 of 3 → 33.33 → 33
    expect(u(300, 100, 0)?.pct).toBe(33);
  });

  it("treats a refund-negative spend as nothing used", () => {
    expect(u(110_000, -500, 0)).toEqual({ pct: 0, tone: "ok" });
  });
});
