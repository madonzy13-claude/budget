/**
 * wallet-balance-sanitize.test.ts — the signed-decimal filter for the wallet
 * balance editor. Only digits, ONE leading "-" (credit-card overdraft), ONE "."
 * survive; comma → dot (PL/UK).
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeAmount,
  amountForSave,
} from "@/components/budgeting/wallets-tab/wallet-row";

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

describe("amountForSave", () => {
  // Clearing the field and confirming is how a member says "this is empty
  // now" — it used to reach the API as "", fail its signed-decimal check and
  // come back as a generic "couldn't save" (user, 260902). An empty balance
  // means zero.
  it("reads an empty balance as zero", () => {
    expect(amountForSave("")).toBe("0");
  });

  it("reads whitespace as zero too", () => {
    expect(amountForSave("   ")).toBe("0");
  });

  it("reads a half-typed value that means nothing as zero", () => {
    // What sanitizeAmount leaves behind mid-entry: a lone minus, a bare dot.
    // None of these is a number, and all of them would be rejected by the API.
    expect(amountForSave("-")).toBe("0");
    expect(amountForSave(".")).toBe("0");
    expect(amountForSave("-.")).toBe("0");
  });

  it("leaves a real amount alone, including a negative one", () => {
    // The credit-card case must survive untouched.
    expect(amountForSave("1500")).toBe("1500");
    expect(amountForSave("-6550")).toBe("-6550");
    expect(amountForSave("12.34")).toBe("12.34");
  });

  it("still sanitises what it is given", () => {
    // Callers used to pass through sanitizeAmount; folding it in means one
    // call at the save boundary rather than two that can drift apart.
    expect(amountForSave("1 000,50 zł")).toBe("1000.50");
  });

  it("is the same rule for a brand-new wallet", () => {
    // The draft mini-form commits on blur; leaving its amount untouched must
    // create a wallet holding nothing rather than fail.
    expect(amountForSave("")).toBe("0");
  });

  it("normalises a bare decimal the API would reject", () => {
    // "-.5" and ".5" pass sanitizeAmount but fail /^-?\d+(\.\d+)?$/.
    expect(amountForSave(".5")).toBe("0.5");
    expect(amountForSave("-.5")).toBe("-0.5");
  });
});
