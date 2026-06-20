/**
 * middleware-locale-precedence.test.ts
 *
 * REAL tests for the signed-out locale-precedence contract (Test 10, UAT phase 8).
 * Unlike the placebo `expect(true)` cases in middleware-accept-language.test.ts,
 * these exercise the actual decision logic via the pure `decideSignedOutLocaleRedirect`
 * helper that middleware.ts delegates to (extracted for testability, same pattern
 * as negotiateLocale — the real Next.js middleware cannot be imported under Vitest
 * because next-intl's middleware pulls in next/server).
 *
 * Contract (signed-out, no URL locale prefix):
 *   budget-locale cookie  >  NEXT_LOCALE cookie  >  Accept-Language  >  "en"
 *
 * A SAVED locale cookie must beat the browser's Accept-Language header. Both the
 * app's account cookie (budget-locale) and next-intl's own cookie (NEXT_LOCALE,
 * which next-intl sets on every localized visit) count as "saved".
 *
 * Return value: the locale to redirect to, or null = fall through to next-intl
 * (which emits the canonical bare "/" → /en for a header-default first visit).
 */

import { describe, test, expect } from "vitest";
import {
  decideSignedOutLocaleRedirect,
  resolveSavedLocale,
} from "../src/lib/negotiate-locale";

describe("resolveSavedLocale", () => {
  test("budget-locale outranks NEXT_LOCALE", () => {
    expect(resolveSavedLocale("pl", "en")).toBe("pl");
  });
  test("falls back to NEXT_LOCALE when budget-locale absent", () => {
    expect(resolveSavedLocale(null, "uk")).toBe("uk");
  });
  test("ignores unsupported values", () => {
    expect(resolveSavedLocale("de", "fr")).toBe(null);
    expect(resolveSavedLocale(undefined, undefined)).toBe(null);
  });
});

describe("decideSignedOutLocaleRedirect — saved cookie beats Accept-Language", () => {
  // ── The two bugs Test 10 surfaced ───────────────────────────────────────────
  test("NEXT_LOCALE=en beats Polish header → en (Case B)", () => {
    expect(
      decideSignedOutLocaleRedirect({
        nextLocaleCookie: "en",
        acceptLanguage: "pl-PL,pl;q=0.9",
      }),
    ).toBe("en");
  });

  test("budget-locale=pl beats English header → pl (Case E)", () => {
    expect(
      decideSignedOutLocaleRedirect({
        budgetLocaleCookie: "pl",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("pl");
  });

  // ── Cookie precedence among the two saved cookies + header ───────────────────
  test("NEXT_LOCALE=pl beats English header → pl (Case C)", () => {
    expect(
      decideSignedOutLocaleRedirect({
        nextLocaleCookie: "pl",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("pl");
  });

  test("budget-locale=en account cookie beats Polish header → en", () => {
    expect(
      decideSignedOutLocaleRedirect({
        budgetLocaleCookie: "en",
        acceptLanguage: "pl-PL,pl;q=0.9",
      }),
    ).toBe("en");
  });

  test("budget-locale outranks a disagreeing NEXT_LOCALE → pl", () => {
    expect(
      decideSignedOutLocaleRedirect({
        budgetLocaleCookie: "pl",
        nextLocaleCookie: "en",
        acceptLanguage: "en-US,en;q=0.9",
      }),
    ).toBe("pl");
  });
});

describe("decideSignedOutLocaleRedirect — no saved cookie, negotiate header", () => {
  test("Polish header → pl", () => {
    expect(
      decideSignedOutLocaleRedirect({ acceptLanguage: "pl-PL,pl;q=0.9" }),
    ).toBe("pl");
  });
  test("Ukrainian header → uk", () => {
    expect(
      decideSignedOutLocaleRedirect({ acceptLanguage: "uk-UA,uk;q=0.9" }),
    ).toBe("uk");
  });
  test("English header, no cookie → null (fall through to next-intl)", () => {
    expect(
      decideSignedOutLocaleRedirect({ acceptLanguage: "en-US,en;q=0.9" }),
    ).toBe(null);
  });
  test("unsupported header, no cookie → null (next-intl emits default /en)", () => {
    expect(
      decideSignedOutLocaleRedirect({ acceptLanguage: "de-DE,de;q=0.9" }),
    ).toBe(null);
  });
  test("absent header, no cookie → null", () => {
    expect(decideSignedOutLocaleRedirect({})).toBe(null);
  });
  test("unsupported cookie ignored, falls back to header → uk", () => {
    expect(
      decideSignedOutLocaleRedirect({
        nextLocaleCookie: "de",
        acceptLanguage: "uk-UA,uk;q=0.9",
      }),
    ).toBe("uk");
  });
});
