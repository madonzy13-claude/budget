import { describe, it, expect } from "bun:test";
import { buildDepositBackdate } from "../../src/application/deposit-backdate";

describe("buildDepositBackdate", () => {
  // rate 0 → own-ccy value == principal, so the arithmetic is exact. With
  // valueInBudgetCents == principal the derived FX is 1.
  const flat = {
    principalCents: "100000",
    rateBps: 0,
    startDate: "2026-01-01",
    capFrequency: "monthly" as const,
    createdAt: "2026-06-01",
    valueInBudgetCents: "100000",
  };
  const today = "2026-12-01";

  it("supplements the gap between startDate and createdAt", () => {
    const at = buildDepositBackdate([flat], today);
    expect(at("2026-03-01")).toBe(100000n); // inside [start, created)
  });

  it("returns 0 before the deposit's start date", () => {
    const at = buildDepositBackdate([flat], today);
    expect(at("2025-12-15")).toBe(0n);
  });

  it("returns 0 on/after createdAt (snapshot already carries it — no double count)", () => {
    const at = buildDepositBackdate([flat], today);
    expect(at("2026-06-01")).toBe(0n);
    expect(at("2026-09-01")).toBe(0n);
  });

  it("applies the derived FX rate (incl. quantity) to the budget currency", () => {
    // valueInBudgetCents = 2 × own-ccy value today → FX 2.
    const at = buildDepositBackdate(
      [{ ...flat, valueInBudgetCents: "200000" }],
      today,
    );
    expect(at("2026-03-01")).toBe(200000n);
  });

  it("sums multiple deposits", () => {
    const at = buildDepositBackdate(
      [flat, { ...flat, principalCents: "50000", valueInBudgetCents: "50000" }],
      today,
    );
    expect(at("2026-03-01")).toBe(150000n);
  });

  it("ignores deposits with no gap (startDate == createdAt)", () => {
    const at = buildDepositBackdate(
      [{ ...flat, startDate: "2026-06-01" }],
      today,
    );
    expect(at("2026-05-01")).toBe(0n);
  });

  it("propagates interest — later dates in the gap are worth more", () => {
    // Positive FX (whatever it derives to) scales monotonic values monotonically.
    const at = buildDepositBackdate(
      [
        {
          ...flat,
          rateBps: 1200,
          capFrequency: "daily",
          valueInBudgetCents: "100000",
        },
      ],
      today,
    );
    const early = at("2026-02-01");
    const late = at("2026-05-01");
    expect(early).toBeGreaterThan(0n);
    expect(late).toBeGreaterThan(early); // interest keeps accruing
  });
});
