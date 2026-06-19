/**
 * middleware-accept-language.test.ts
 *
 * Tests for Accept-Language first-visit negotiation in middleware.ts.
 * Verifies the negotiation logic (extracted helper) for pl/uk/de/absent cases
 * and that cookie/session locale wins over Accept-Language.
 */

import { describe, test, expect } from "vitest";

// We test the negotiation logic directly as a pure function
// extracted from middleware for testability.
import { negotiateLocale } from "../src/lib/negotiate-locale";

describe("negotiateLocale", () => {
  describe("Accept-Language first-visit negotiation", () => {
    test("pl-PL returns pl", () => {
      expect(negotiateLocale("pl-PL,pl;q=0.9,en;q=0.8")).toBe("pl");
    });

    test("pl alone returns pl", () => {
      expect(negotiateLocale("pl")).toBe("pl");
    });

    test("uk-UA returns uk", () => {
      expect(negotiateLocale("uk-UA,uk;q=0.9")).toBe("uk");
    });

    test("uk alone returns uk", () => {
      expect(negotiateLocale("uk")).toBe("uk");
    });

    test("de returns en (not supported)", () => {
      expect(negotiateLocale("de-DE,de;q=0.9")).toBe("en");
    });

    test("fr returns en (not supported)", () => {
      expect(negotiateLocale("fr")).toBe("en");
    });

    test("empty string returns en", () => {
      expect(negotiateLocale("")).toBe("en");
    });

    test("null/undefined returns en", () => {
      expect(negotiateLocale(null)).toBe("en");
      expect(negotiateLocale(undefined)).toBe("en");
    });

    test("en-US returns en", () => {
      expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    });

    test("en returns en", () => {
      expect(negotiateLocale("en")).toBe("en");
    });

    test("malformed header returns en", () => {
      expect(negotiateLocale(";;invalid;;")).toBe("en");
    });

    test("pl in second position still returns en (only first segment used)", () => {
      // Accept-Language precedence: first tag wins, we only read [0]
      expect(negotiateLocale("en-US,pl;q=0.5")).toBe("en");
    });

    test("pl with quality tag returns pl", () => {
      expect(negotiateLocale("pl;q=0.9")).toBe("pl");
    });
  });

  describe("supported locales exhaustive", () => {
    const supported = ["en", "pl", "uk"] as const;
    for (const locale of supported) {
      test(`${locale} is recognized`, () => {
        expect(negotiateLocale(locale)).toBe(locale);
      });
    }
  });
});

// The signed-out precedence contract (cookie > Accept-Language) is now REALLY
// exercised — see middleware-locale-precedence.test.ts (decideSignedOutLocaleRedirect).
// The previous `expect(true).toBe(true)` placebos here were removed: they passed
// without ever running middleware, which is exactly how UAT Test 10's cases B/E
// (a saved cookie NOT beating the header) slipped through.
