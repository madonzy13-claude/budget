import { describe, test, expect } from "bun:test";
import { sanePositiveNumber, assertBodyUnderCap } from "../src/provider-guards";

describe("sanePositiveNumber", () => {
  test("accepts a normal price unchanged", () => {
    expect(sanePositiveNumber(150.25)).toBe(150.25);
    expect(sanePositiveNumber(Number("150.25"))).toBe(150.25);
    expect(sanePositiveNumber(0.00000001)).toBe(0.00000001);
    expect(sanePositiveNumber(1e12)).toBe(1e12); // ceiling is inclusive
  });

  test("rejects NaN / Infinity / non-finite", () => {
    expect(() => sanePositiveNumber(NaN)).toThrow();
    expect(() => sanePositiveNumber(Infinity)).toThrow();
    expect(() => sanePositiveNumber(-Infinity)).toThrow();
    expect(() => sanePositiveNumber(Number("not-a-number"))).toThrow();
  });

  test("rejects zero and negatives", () => {
    expect(() => sanePositiveNumber(0)).toThrow();
    expect(() => sanePositiveNumber(-1)).toThrow();
    expect(() => sanePositiveNumber(-0.01)).toThrow();
  });

  test("rejects values over the ceiling (1e13)", () => {
    expect(() => sanePositiveNumber(1e13)).toThrow();
    expect(() => sanePositiveNumber(1e12 + 1)).toThrow();
  });
});

describe("assertBodyUnderCap", () => {
  const withLen = (len: string | null) => ({
    headers: { get: (n: string) => (n === "content-length" ? len : null) },
  });

  test("throws when content-length exceeds cap", () => {
    expect(() => assertBodyUnderCap(withLen("2000000"), 1_000_000)).toThrow();
  });

  test("passes when under cap or header absent", () => {
    expect(() => assertBodyUnderCap(withLen("500"), 1_000_000)).not.toThrow();
    expect(() => assertBodyUnderCap(withLen(null), 1_000_000)).not.toThrow();
    expect(() => assertBodyUnderCap({}, 1_000_000)).not.toThrow();
  });
});
