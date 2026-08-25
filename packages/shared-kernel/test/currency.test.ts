import { test, expect, describe } from "bun:test";
import { asCurrency, isCrypto, isFiat } from "../src/currency";

describe("asCurrency", () => {
  test("normalises to upper case", () => {
    expect(asCurrency("eur")).toBe("EUR" as ReturnType<typeof asCurrency>);
    expect(asCurrency("pLn")).toBe("PLN" as ReturnType<typeof asCurrency>);
  });

  test("accepts any three-letter fiat code", () => {
    for (const c of ["EUR", "PLN", "UAH", "USD", "GBP"])
      expect(asCurrency(c)).toBe(c as ReturnType<typeof asCurrency>);
  });

  test("accepts the known crypto codes, including the four-letter ones", () => {
    // USDT/USDC are 4 chars and so fail the 3-letter fiat pattern — they are
    // accepted only because they are on the crypto list. That is the whole
    // reason the list exists, so it is worth pinning.
    for (const c of ["BTC", "ETH", "USDT", "USDC", "BNB", "SOL"])
      expect(asCurrency(c)).toBe(c as ReturnType<typeof asCurrency>);
  });

  test("rejects anything that is neither", () => {
    for (const bad of ["EU", "EURO", "E1R", "", "12", "$$$"])
      expect(() => asCurrency(bad)).toThrow(/Invalid currency code/);
  });
});

describe("isCrypto / isFiat", () => {
  test("splits the two families, and never claims both", () => {
    for (const c of ["BTC", "USDT"]) {
      expect(isCrypto(asCurrency(c))).toBe(true);
      expect(isFiat(asCurrency(c))).toBe(false);
    }
    for (const c of ["EUR", "PLN", "UAH"]) {
      expect(isCrypto(asCurrency(c))).toBe(false);
      expect(isFiat(asCurrency(c))).toBe(true);
    }
  });
});
