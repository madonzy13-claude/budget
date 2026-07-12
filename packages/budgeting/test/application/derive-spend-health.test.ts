// packages/budgeting/test/application/derive-spend-health.test.ts
//
// deriveSpendHealth — the "Available to spend" card health, derived from the
// cash-flow projection.
//   ICON (`good`):
//     - no income        → null (grey/neutral dot)
//     - income exists     → false if ANY red day at/before the LAST income in the
//                           window (today→end of next month); else true.
//   SURPLUS/DEFICIT (`surplusDeficitCents`):
//     - no income        → null (the card shows the old "upcoming" figure instead)
//     - income exists     → projected cash on the day BEFORE the NEAREST (first)
//                           income. ≥0 = surplus, <0 = deficit.
import { describe, test, expect } from "bun:test";
import {
  deriveSpendHealth,
  type DayCell,
  type DayColor,
} from "@budget/budgeting/src/application/simulate-cashflow-projection";

/** Build a bare DayCell; only date/color/availableCents matter to the derivation. */
function day(date: string, color: DayColor, availableCents: bigint): DayCell {
  return {
    date,
    color,
    availableCents,
    drewReserve: [],
    shortfall: [],
    incomeCents: 0n,
    billCents: 0n,
  };
}

/** Contiguous daily green cells from `start`..`end` inclusive, cash flat. */
function greenRange(start: string, end: string, cash: bigint): DayCell[] {
  const out: DayCell[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) {
    out.push(day(new Date(t).toISOString().slice(0, 10), "green", cash));
  }
  return out;
}

const set = (days: DayCell[], date: string, patch: Partial<DayCell>) =>
  days.map((c) => (c.date === date ? { ...c, ...patch } : c));

describe("deriveSpendHealth", () => {
  test("no income → grey dot (good null) + no surplus/deficit (null)", () => {
    const days = greenRange("2026-07-15", "2026-08-31", 12_000n);
    const h = deriveSpendHealth({ days, incomePoints: [] });
    expect(h.good).toBeNull();
    expect(h.surplusDeficitCents).toBeNull();
  });

  test("income, no red up to last income → good; surplus = day BEFORE the FIRST income", () => {
    let days = greenRange("2026-07-15", "2026-08-31", 40_000n);
    days = set(days, "2026-07-24", { availableCents: 5_000n }); // day before FIRST income
    days = set(days, "2026-08-24", { availableCents: 9_999n }); // day before LAST income (must be ignored)
    const h = deriveSpendHealth({
      days,
      incomePoints: [{ date: "2026-07-25" }, { date: "2026-08-25" }],
    });
    expect(h.good).toBe(true);
    expect(h.surplusDeficitCents).toBe(5_000n); // nearest income, NOT 9_999
  });

  test("red AFTER first income but before last income → not good (icon spans to last income)", () => {
    let days = greenRange("2026-07-15", "2026-08-31", 40_000n);
    days = set(days, "2026-08-10", { color: "red", availableCents: -2_000n });
    days = set(days, "2026-07-24", { availableCents: 5_000n });
    const h = deriveSpendHealth({
      days,
      incomePoints: [{ date: "2026-07-25" }, { date: "2026-08-25" }],
    });
    expect(h.good).toBe(false);
    expect(h.surplusDeficitCents).toBe(5_000n); // value still day-before-first
  });

  test("red only AFTER the last income (beyond horizon) → still good", () => {
    let days = greenRange("2026-07-15", "2026-08-31", 40_000n);
    days = set(days, "2026-08-30", { color: "red", availableCents: -9_000n });
    days = set(days, "2026-07-24", { availableCents: 7_000n });
    const h = deriveSpendHealth({
      days,
      incomePoints: [{ date: "2026-07-25" }, { date: "2026-08-25" }],
    });
    expect(h.good).toBe(true);
    expect(h.surplusDeficitCents).toBe(7_000n);
  });

  test("deficit before the first income → good false, negative value at day-before-first", () => {
    let days = greenRange("2026-07-15", "2026-08-31", 40_000n);
    days = set(days, "2026-07-19", { color: "red", availableCents: -4_500n });
    const h = deriveSpendHealth({
      days,
      incomePoints: [{ date: "2026-07-20" }, { date: "2026-08-25" }],
    });
    expect(h.good).toBe(false);
    expect(h.surplusDeficitCents).toBe(-4_500n); // day before FIRST income (07-19)
  });

  test("empty projection → grey, null (degenerate)", () => {
    const h = deriveSpendHealth({ days: [], incomePoints: [] });
    expect(h.good).toBeNull();
    expect(h.surplusDeficitCents).toBeNull();
  });
});
