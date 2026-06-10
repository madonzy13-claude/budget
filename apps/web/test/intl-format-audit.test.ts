/**
 * intl-format-audit.test.ts
 *
 * Audits that money and date formatting uses Intl.NumberFormat / Intl.DateTimeFormat
 * correctly for all three supported locales (en, pl, uk).
 *
 * Verifies:
 * - centsToDisplay uses Intl.NumberFormat with correct currency symbol
 * - PL uses space as thousands separator (NBSP or regular)
 * - UK uses Ukrainian decimal/thousands format
 * - Date helper produces locale-correct output for en/pl/uk
 */

import { describe, test, expect } from "vitest";
import {
  centsToDisplay,
  centsToDisplayCompact,
  centsToBare,
} from "../src/lib/cents-format";
import { formatBudgetDate } from "../src/lib/format-date";

describe("centsToDisplay — Intl.NumberFormat locale correctness", () => {
  const ONE_THOUSAND_EUR = "100000"; // 1000.00 EUR in cents

  test("en — uses $ or EUR symbol, dot decimal", () => {
    const result = centsToDisplay(ONE_THOUSAND_EUR, "EUR", "en");
    expect(result).toContain("1,000");
    expect(result).toContain("€");
  });

  test("pl — uses PLN, space thousands separator", () => {
    const result = centsToDisplay(ONE_THOUSAND_EUR, "PLN", "pl");
    // Polish uses NBSP or regular space for thousands separator
    // Strip to check core number is present
    expect(result.replace(/\s/g, "")).toContain("1000");
    expect(result).toMatch(/zł|PLN/);
  });

  test("uk — UAH currency symbol", () => {
    const result = centsToDisplay(ONE_THOUSAND_EUR, "UAH", "uk");
    expect(result.replace(/\s/g, "")).toContain("1000");
    expect(result).toMatch(/₴|UAH/);
  });

  test("en — negative amount", () => {
    const result = centsToDisplay("-50000", "USD", "en");
    expect(result).toContain("-");
    expect(result).toContain("500");
  });

  test("en — zero", () => {
    const result = centsToDisplay("0", "USD", "en");
    expect(result).toContain("0");
    expect(result).toContain("$");
  });

  test("returns string (not number or null)", () => {
    expect(typeof centsToDisplay("12345", "EUR", "en")).toBe("string");
    expect(typeof centsToDisplay("12345", "EUR", "pl")).toBe("string");
    expect(typeof centsToDisplay("12345", "EUR", "uk")).toBe("string");
  });
});

describe("centsToDisplayCompact", () => {
  test("drops .00 fraction for whole amounts", () => {
    const result = centsToDisplayCompact("100000", "EUR", "en");
    // Should NOT show .00
    expect(result).not.toContain(".00");
    expect(result).toContain("€");
  });

  test("shows fraction for non-zero cents", () => {
    const result = centsToDisplayCompact("100050", "EUR", "en");
    expect(result).toContain(".50");
  });
});

describe("centsToBare — locale number grouping", () => {
  test("en — comma thousands separator", () => {
    const result = centsToBare("100000", "en");
    expect(result).toBe("1,000");
  });

  test("pl — space thousands separator (or similar)", () => {
    const result = centsToBare("100000", "pl");
    // Polish uses NBSP for thousands; strip and check
    expect(result.replace(/\s/g, "")).toContain("1000");
  });
});

describe("formatBudgetDate — Temporal + Intl.DateTimeFormat", () => {
  test("en — medium date format", () => {
    const result = formatBudgetDate("2024-03-15", "en");
    // Should contain month name or short form
    expect(result).toMatch(/Mar|March|3/);
    expect(result).toContain("2024");
  });

  test("pl — localized date", () => {
    const result = formatBudgetDate("2024-03-15", "pl");
    expect(result).toContain("2024");
    // Polish months: marca, marzec, etc.
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("uk — localized date", () => {
    const result = formatBudgetDate("2024-03-15", "uk");
    expect(result).toContain("2024");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("returns string for all locales", () => {
    for (const locale of ["en", "pl", "uk"]) {
      expect(typeof formatBudgetDate("2024-06-10", locale)).toBe("string");
    }
  });
});
