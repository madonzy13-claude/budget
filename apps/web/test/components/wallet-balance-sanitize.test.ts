/**
 * wallet-balance-sanitize.test.ts — the signed-decimal filter for the wallet
 * balance editor. Only digits, ONE leading "-" (credit-card overdraft), ONE "."
 * survive; comma → dot (PL/UK).
 */
import { describe, it, expect } from "vitest";
import { sanitizeAmount } from "@/components/budgeting/wallets-tab/wallet-row";

describe("sanitizeAmount", () => {
  it("keeps a leading minus (negative balance)", () => {
    expect(sanitizeAmount("-1500")).toBe("-1500");
    expect(sanitizeAmount("-12.34")).toBe("-12.34");
  });
  it("allows typing a lone minus mid-entry", () => {
    expect(sanitizeAmount("-")).toBe("-");
  });
  it("drops non-leading minuses", () => {
    expect(sanitizeAmount("5-3")).toBe("53");
    expect(sanitizeAmount("--5")).toBe("-5");
  });
  it("translates comma to dot and keeps only one dot", () => {
    expect(sanitizeAmount("12,50")).toBe("12.50");
    expect(sanitizeAmount("1.2.3")).toBe("1.23");
    expect(sanitizeAmount("1,2,3")).toBe("1.23");
  });
  it("strips letters, symbols, spaces", () => {
    expect(sanitizeAmount("1 000 zł")).toBe("1000");
    expect(sanitizeAmount("abc-4.5x")).toBe("-4.5");
  });
});
