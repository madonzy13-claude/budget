/**
 * income-under-planned.test.ts — the pure emit-or-resolve decision for the
 * INCOME_UNDER_PLANNED task (r33). Fires ONLY when the budget has income AND
 * monthly income is strictly below total planned.
 */
import { describe, test, expect } from "bun:test";
import { decideIncomeUnderPlanned } from "@budget/budgeting/src/application/recompute-income-under-planned-task";

describe("Income under planned decision", () => {
  test("no income → never emit (task needs income provided)", () => {
    const d = decideIncomeUnderPlanned({
      hasIncome: false,
      monthlyIncomeCents: 0n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(false);
    expect(d.shortfallCents).toBe(0n);
  });

  test("income < planned → emit with shortfall = planned − income", () => {
    const d = decideIncomeUnderPlanned({
      hasIncome: true,
      monthlyIncomeCents: 300000n, // $3,000
      plannedCents: 500000n, // $5,000
    });
    expect(d.emit).toBe(true);
    expect(d.shortfallCents).toBe(200000n); // $2,000 over
  });

  test("income == planned → no emit (nothing to invest, but no overspend)", () => {
    const d = decideIncomeUnderPlanned({
      hasIncome: true,
      monthlyIncomeCents: 500000n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(false);
    expect(d.shortfallCents).toBe(0n);
  });

  test("income > planned → no emit", () => {
    const d = decideIncomeUnderPlanned({
      hasIncome: true,
      monthlyIncomeCents: 800000n,
      plannedCents: 500000n,
    });
    expect(d.emit).toBe(false);
  });

  test("has income but planned zero → no emit", () => {
    const d = decideIncomeUnderPlanned({
      hasIncome: true,
      monthlyIncomeCents: 300000n,
      plannedCents: 0n,
    });
    expect(d.emit).toBe(false);
  });
});
