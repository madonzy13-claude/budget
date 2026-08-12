// annualise-scheduled — a year's worth of standing commitments, per category.
//
// Factors the member specified: monthly ×12, weekly ×52.143 (= 365/7), which
// fixes DAILY at ×365 and YEARLY at ×1. ONCE does not recur, so it contributes
// nothing to a year of commitments (user, 260811).
import { describe, test, expect } from "bun:test";
import {
  annualFactor,
  annualiseCents,
  annualiseByCategory,
} from "@budget/budgeting/src/domain/annualise-scheduled";

describe("annualFactor", () => {
  test("the member's two figures", () => {
    expect(annualFactor("MONTHLY")).toBe(12);
    expect(annualFactor("WEEKLY")).toBe(52.143);
  });

  test("the two that follow from them", () => {
    expect(annualFactor("DAILY")).toBe(365);
    expect(annualFactor("YEARLY")).toBe(1);
  });

  test("ONCE is not a commitment that repeats", () => {
    expect(annualFactor("ONCE")).toBe(0);
  });
});

describe("annualiseCents", () => {
  test("monthly 40.00 → 480.00 a year", () => {
    expect(annualiseCents(4_000n, "MONTHLY")).toBe(48_000n);
  });

  test("weekly 10.00 → 521.43 a year", () => {
    expect(annualiseCents(1_000n, "WEEKLY")).toBe(52_143n);
  });

  test("weekly rounds to the nearest cent, never a fraction of one", () => {
    // 333 × 52.143 = 17,363.619 → 17,364
    expect(annualiseCents(333n, "WEEKLY")).toBe(17_364n);
  });

  test("yearly passes through untouched", () => {
    expect(annualiseCents(50_000n, "YEARLY")).toBe(50_000n);
  });

  test("daily 1.00 → 365.00", () => {
    expect(annualiseCents(100n, "DAILY")).toBe(36_500n);
  });

  test("a ONCE payment contributes nothing", () => {
    expect(annualiseCents(99_999n, "ONCE")).toBe(0n);
  });
});

describe("annualiseByCategory", () => {
  const p = (
    category_id: string | null,
    name: string | null,
    amount_cents: bigint,
    cadence: Parameters<typeof annualiseCents>[1],
  ) => ({ category_id, name, amount_cents, cadence });

  test("sums every commitment in a category into one yearly figure", () => {
    const out = annualiseByCategory([
      p("c1", "Subscriptions", 4_000n, "MONTHLY"), // 480.00
      p("c1", "Subscriptions", 50_000n, "YEARLY"), // 500.00
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.category_id).toBe("c1");
    expect(out[0]!.amount_cents).toBe(98_000n);
  });

  // The tooltip shows the working, not just the total: "200 × 12m = 2,400"
  // (user, 260811), so each payment carries its own rate and yearly figure.
  test("keeps the payments behind the bar, biggest first", () => {
    const out = annualiseByCategory([
      { ...p("c1", "Subscriptions", 4_000n, "MONTHLY"), rule_name: "Netflix" },
      { ...p("c1", "Subscriptions", 50_000n, "YEARLY"), rule_name: "Domain" },
    ]);
    expect(out[0]!.items).toEqual([
      {
        name: "Domain",
        amount_cents: 50_000n,
        cadence: "YEARLY",
        yearly_cents: 50_000n,
      },
      {
        name: "Netflix",
        amount_cents: 4_000n,
        cadence: "MONTHLY",
        yearly_cents: 48_000n,
      },
    ]);
  });

  test("a ONCE payment is not listed either", () => {
    const out = annualiseByCategory([
      { ...p("c1", "Travel", 4_000n, "MONTHLY"), rule_name: "Saver" },
      { ...p("c1", "Travel", 90_000n, "ONCE"), rule_name: "Camping" },
    ]);
    expect(out[0]!.items.map((i) => i.name)).toEqual(["Saver"]);
  });

  test("orders categories biggest first", () => {
    const out = annualiseByCategory([
      p("small", "Sport", 100n, "MONTHLY"),
      p("big", "Housing", 100_000n, "MONTHLY"),
      p("mid", "Car", 1_000n, "MONTHLY"),
    ]);
    expect(out.map((r) => r.name)).toEqual(["Housing", "Car", "Sport"]);
  });

  test("payments with no category share one bucket, not one each", () => {
    const out = annualiseByCategory([
      p(null, null, 1_000n, "MONTHLY"),
      p(null, null, 2_000n, "MONTHLY"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.category_id).toBeNull();
    expect(out[0]!.amount_cents).toBe(36_000n);
    expect(out[0]!.items).toHaveLength(2);
  });

  test("a category with only ONCE payments is dropped, not drawn empty", () => {
    const out = annualiseByCategory([
      p("c1", "Travel", 500_000n, "ONCE"),
      p("c2", "Rent", 200_000n, "MONTHLY"),
    ]);
    expect(out.map((r) => r.name)).toEqual(["Rent"]);
  });

  test("nothing scheduled → nothing to draw", () => {
    expect(annualiseByCategory([])).toEqual([]);
  });
});
