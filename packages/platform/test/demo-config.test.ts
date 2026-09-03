/**
 * demo-config.test.ts — the inert-by-default guarantee, and one account per
 * language.
 *
 * This feature reads one household's real finances. It must never turn itself
 * on because a variable was missing, and it must never guess a pairing.
 */
import { describe, test, expect } from "bun:test";
import {
  readDemoConfig,
  scaleForPair,
  isDemoUser,
  isDemoTenantId,
} from "../src/demo/config";

const BASE = {
  DEMO_SOURCE_TENANT_IDS: "src-personal,src-family",
  DEMO_CURRENCIES: "USD,EUR",
  DEMO_LABELS: "personal,family",
  DEMO_SHARED_LABELS: "family",
  DEMO_HOME_CURRENCY: "PLN",
};

/** Single-locale shape, as it existed before per-language accounts. */
const LEGACY = {
  ...BASE,
  DEMO_TENANT_IDS: "dst-personal,dst-family",
  DEMO_USER_ID: "demo-en",
  DEMO_SECOND_USER_ID: "member-en",
};

const MULTI = {
  ...BASE,
  DEMO_LOCALES: "en,pl,uk",
  // Personal budget in the language's own currency; family always euro.
  DEMO_CURRENCIES_EN: "USD,EUR",
  DEMO_CURRENCIES_PL: "PLN,EUR",
  DEMO_CURRENCIES_UK: "UAH,EUR",
  DEMO_TENANT_IDS_EN: "en-personal,en-family",
  DEMO_USER_ID_EN: "demo-en",
  DEMO_SECOND_USER_ID_EN: "member-en",
  DEMO_TENANT_IDS_PL: "pl-personal,pl-family",
  DEMO_USER_ID_PL: "demo-pl",
  DEMO_SECOND_USER_ID_PL: "member-pl",
  DEMO_MONEY_SCALES_EN: "0.325,2.208",
  DEMO_MONEY_SCALES_PL: "0.844,2.208",
  DEMO_MONEY_SCALES_UK: "1.312,2.208",
  DEMO_TENANT_IDS_UK: "uk-personal,uk-family",
  DEMO_USER_ID_UK: "demo-uk",
  DEMO_SECOND_USER_ID_UK: "member-uk",
};

describe("readDemoConfig", () => {
  test("an unconfigured environment yields null, not a default", () => {
    expect(readDemoConfig({})).toBeNull();
  });

  test("null when the source list or the account is missing", () => {
    expect(
      readDemoConfig({ ...LEGACY, DEMO_SOURCE_TENANT_IDS: "" }),
    ).toBeNull();
    expect(readDemoConfig({ ...LEGACY, DEMO_USER_ID: "" })).toBeNull();
  });

  test("mismatched source/dest lists yield null rather than a guessed pairing", () => {
    // The one misconfiguration that could copy the wrong budget into a public
    // login. Refusing is the only acceptable behaviour.
    expect(
      readDemoConfig({ ...LEGACY, DEMO_TENANT_IDS: "dst-personal" }),
    ).toBeNull();
  });

  test("the pre-multi-locale shape still works, as English", () => {
    const cfg = readDemoConfig(LEGACY)!;
    expect(cfg.pairs).toHaveLength(2);
    expect(cfg.pairs.every((p) => p.textLocale === "en")).toBe(true);
    expect(cfg.userByLocale).toEqual({ en: "demo-en" });
  });

  test("one account and one budget pair per language", () => {
    const cfg = readDemoConfig(MULTI)!;
    expect(cfg.pairs).toHaveLength(6);
    expect(cfg.userByLocale).toEqual({
      en: "demo-en",
      pl: "demo-pl",
      uk: "demo-uk",
    });
    // Every budget belongs to the account for ITS language — this is what makes
    // a Polish visitor land in a Polish budget rather than a translated shell
    // over English data.
    for (const p of cfg.pairs) {
      expect(p.demoUserId).toBe(`demo-${p.textLocale}`);
    }
  });

  test("budget names come from the language's own vocabulary", () => {
    const cfg = readDemoConfig(MULTI)!;
    // Keyed on the LABEL, not the currency — currencies now differ per
    // language, which is what the neighbouring tests cover.
    const names = Object.fromEntries(
      cfg.pairs.map((p) => [p.label, p.budgetName]),
    );
    expect(names["personal-en"]).toBe("Personal");
    expect(names["personal-pl"]).toBe("Osobisty");
    expect(names["personal-uk"]).toBe("Особистий");
  });

  test("a half-configured language is SKIPPED, never half-built", () => {
    // Signing a visitor into an empty or partly-copied budget is worse than
    // telling them the demo is unavailable in their language.
    const cfg = readDemoConfig({ ...MULTI, DEMO_USER_ID_UK: "" })!;
    expect(Object.keys(cfg.userByLocale).sort()).toEqual(["en", "pl"]);
    expect(cfg.pairs.every((p) => p.textLocale !== "uk")).toBe(true);
  });

  test("relabels the home currency only when the destination differs", () => {
    const cfg = readDemoConfig({ ...LEGACY, DEMO_CURRENCIES: "USD,PLN" })!;
    const [personal, family] = cfg.pairs;
    expect(personal!.currency).toBe("USD");
    expect(personal!.currencyMap).toEqual({ PLN: "USD" });
    // Destination equals the source's home currency → nothing to relabel.
    expect(family!.currency).toBe("PLN");
    expect(family!.currencyMap).toEqual({});
  });

  test("each language's PERSONAL budget uses that language's currency", () => {
    const cfg = readDemoConfig(MULTI)!;
    const personal = Object.fromEntries(
      cfg.pairs
        .filter((p) => p.label.startsWith("personal"))
        .map((p) => [p.textLocale, p.currency]),
    );
    expect(personal).toEqual({ en: "USD", pl: "PLN", uk: "UAH" });
  });

  test("the family budget is euro in every language", () => {
    const cfg = readDemoConfig(MULTI)!;
    for (const p of cfg.pairs.filter((x) => x.label.startsWith("family"))) {
      expect({ locale: p.textLocale, currency: p.currency }).toEqual({
        locale: p.textLocale,
        currency: "EUR",
      });
    }
  });

  test("the account's display currency follows its personal budget", () => {
    // The "global" currency: what every cross-budget total is rendered in.
    const cfg = readDemoConfig(MULTI)!;
    expect(cfg.accountCurrencyByLocale).toEqual({
      en: "USD",
      pl: "PLN",
      uk: "UAH",
    });
  });

  test("personal and family never share a currency, in any language", () => {
    // What keeps the all-budgets total a real FX conversion rather than plain
    // addition — in every language, not just the one that happened to be set up.
    const cfg = readDemoConfig(MULTI)!;
    for (const locale of ["en", "pl", "uk"]) {
      const forLocale = cfg.pairs.filter((p) => p.textLocale === locale);
      const currencies = new Set(forLocale.map((p) => p.currency));
      expect({ locale, distinct: currencies.size }).toEqual({
        locale,
        distinct: forLocale.length,
      });
    }
  });

  test("the second member lands only on pairs named as shared", () => {
    const cfg = readDemoConfig(LEGACY)!;
    const byLabel = Object.fromEntries(cfg.pairs.map((p) => [p.label, p]));
    expect(byLabel["personal-en"]!.secondMemberUserId).toBeUndefined();
    expect(byLabel["family-en"]!.secondMemberUserId).toBe("member-en");
  });
});

describe("demo identity predicates", () => {
  test("every demo account is recognised, across languages", () => {
    const cfg = readDemoConfig(MULTI)!;
    for (const id of ["demo-en", "demo-pl", "demo-uk", "member-pl"]) {
      expect(isDemoUser(id, cfg)).toBe(true);
    }
    expect(isDemoUser("a-real-person", cfg)).toBe(false);
    expect(isDemoUser(undefined, cfg)).toBe(false);
  });

  test("every demo budget is recognised, and no other", () => {
    const cfg = readDemoConfig(MULTI)!;
    expect(isDemoTenantId("pl-family", cfg)).toBe(true);
    expect(isDemoTenantId("uk-personal", cfg)).toBe(true);
    expect(isDemoTenantId("src-personal", cfg)).toBe(false); // the OWNER's
    expect(isDemoTenantId(undefined, cfg)).toBe(false);
  });

  test("with the demo unconfigured, nothing is a demo anything", () => {
    expect(isDemoUser("demo-en", null)).toBe(false);
    expect(isDemoTenantId("en-family", null)).toBe(false);
  });
});

describe("scaleForPair", () => {
  test("is a CONSTANT — the same budget yields the same factor every time", () => {
    // It used to be re-rolled nightly, which swung capitalization 60-90%
    // between consecutive days. Anyone revisiting the demo saw chaos.
    const cfg = readDemoConfig(MULTI)!;
    const p = cfg.pairs[0]!;
    expect(scaleForPair(p)).toBe(scaleForPair(p));
    expect(scaleForPair(p)).toBe(0.325);
  });

  test("each budget carries its own factor", () => {
    // One constant cannot make a dollar budget and a hryvnia budget both look
    // plausible, so the factor is per budget.
    const cfg = readDemoConfig(MULTI)!;
    const byLabel = Object.fromEntries(
      cfg.pairs.map((p) => [p.label, scaleForPair(p)]),
    );
    expect(byLabel["personal-en"]).toBe(0.325);
    expect(byLabel["personal-pl"]).toBe(0.844);
    expect(byLabel["personal-uk"]).toBe(1.312);
  });

  test("a missing or nonsensical factor falls back to 1, never to a guess", () => {
    for (const bad of ["", "abc", "0", "-1", "1e9"]) {
      const cfg = readDemoConfig({ ...MULTI, DEMO_MONEY_SCALES_EN: bad })!;
      const en = cfg.pairs.find((p) => p.label === "personal-en")!;
      expect({ bad, scale: scaleForPair(en) }).toEqual({ bad, scale: 1 });
    }
  });
});
