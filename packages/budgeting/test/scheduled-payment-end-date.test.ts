/**
 * scheduled-payment-end-date.test.ts — the end_date (a.k.a. "last date") cutoff for
 * scheduled rules. A rule stops producing drafts once its next occurrence
 * passes end_date (inclusive). Pure ISO-string predicate — same logic drives
 * the worker engine and the create-time catch-up loop.
 */
import { describe, it, expect } from "bun:test";
import { isRuleExhausted } from "../src/domain/scheduled-payment-end-date";

describe("isRuleExhausted", () => {
  it("no end date → never exhausted", () => {
    expect(isRuleExhausted("2026-07-21", null)).toBe(false);
    expect(isRuleExhausted("2099-01-01", null)).toBe(false);
  });

  it("occurrence before end date → not exhausted", () => {
    expect(isRuleExhausted("2026-07-20", "2026-07-31")).toBe(false);
  });

  it("occurrence ON end date → not exhausted (inclusive)", () => {
    expect(isRuleExhausted("2026-07-31", "2026-07-31")).toBe(false);
  });

  it("occurrence after end date → exhausted", () => {
    expect(isRuleExhausted("2026-08-01", "2026-07-31")).toBe(true);
  });
});
