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
  DEMO_CURRENCIES: "USD,PLN",
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
  DEMO_TENANT_IDS_EN: "en-personal,en-family",
  DEMO_USER_ID_EN: "demo-en",
  DEMO_SECOND_USER_ID_EN: "member-en",
  DEMO_TENANT_IDS_PL: "pl-personal,pl-family",
  DEMO_USER_ID_PL: "demo-pl",
  DEMO_SECOND_USER_ID_PL: "member-pl",
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
    const names = Object.fromEntries(
      cfg.pairs.map((p) => [`${p.textLocale}-${p.currency}`, p.budgetName]),
    );
    expect(names["en-USD"]).toBe("Personal");
    expect(names["pl-USD"]).toBe("Osobisty");
    expect(names["uk-USD"]).toBe("Особистий");
  });

  test("a half-configured language is SKIPPED, never half-built", () => {
    // Signing a visitor into an empty or partly-copied budget is worse than
    // telling them the demo is unavailable in their language.
    const cfg = readDemoConfig({ ...MULTI, DEMO_USER_ID_UK: "" })!;
    expect(Object.keys(cfg.userByLocale).sort()).toEqual(["en", "pl"]);
    expect(cfg.pairs.every((p) => p.textLocale !== "uk")).toBe(true);
  });

  test("relabels the home currency only when the destination differs", () => {
    const cfg = readDemoConfig(LEGACY)!;
    const [personal, family] = cfg.pairs;
    expect(personal!.currency).toBe("USD");
    expect(personal!.currencyMap).toEqual({ PLN: "USD" });
    expect(family!.currency).toBe("PLN");
    expect(family!.currencyMap).toEqual({});
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
  test("draws a different factor per day and per pair", () => {
    const cfg = readDemoConfig(MULTI)!;
    const [a, b] = cfg.pairs;
    expect(scaleForPair(cfg, a!, "2026-08-29")).not.toBe(
      scaleForPair(cfg, a!, "2026-08-30"),
    );
    expect(scaleForPair(cfg, a!, "2026-08-29")).not.toBe(
      scaleForPair(cfg, b!, "2026-08-29"),
    );
  });

  test("stays inside [0.1, 10] across a year", () => {
    const cfg = readDemoConfig(MULTI)!;
    for (let d = 0; d < 365; d++) {
      const s = scaleForPair(cfg, cfg.pairs[0]!, `2026-day-${d}`);
      expect(s).toBeGreaterThanOrEqual(0.1);
      expect(s).toBeLessThanOrEqual(10);
    }
  });

  test("an explicit DEMO_MONEY_SCALE pins the factor (tests only)", () => {
    const cfg = readDemoConfig({ ...LEGACY, DEMO_MONEY_SCALE: "0.25" })!;
    expect(scaleForPair(cfg, cfg.pairs[0]!, "any-day")).toBe(0.25);
  });

  test("a nonsense DEMO_MONEY_SCALE is ignored rather than obeyed", () => {
    for (const bad of ["0", "-1", "abc"]) {
      const cfg = readDemoConfig({ ...LEGACY, DEMO_MONEY_SCALE: bad })!;
      expect(cfg.fixedMoneyScale).toBeUndefined();
    }
  });
});
