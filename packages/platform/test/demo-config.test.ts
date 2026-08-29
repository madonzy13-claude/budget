/**
 * demo-config.test.ts — the inert-by-default guarantee.
 *
 * This feature reads one household's real finances. It must never turn itself
 * on because a variable was missing, and it must never guess a pairing.
 */
import { describe, test, expect } from "bun:test";
import { readDemoConfig, scaleForPair } from "../src/demo/config";

const FULL = {
  DEMO_SOURCE_TENANT_IDS: "aaa,bbb",
  DEMO_TENANT_IDS: "xxx,yyy",
  DEMO_USER_ID: "demo-user",
  DEMO_CURRENCIES: "USD,PLN",
  DEMO_BUDGET_NAMES: "Personal,Family",
  DEMO_LABELS: "personal,family",
  DEMO_HOME_CURRENCY: "PLN",
};

describe("readDemoConfig", () => {
  test("an unconfigured environment yields null, not a default", () => {
    expect(readDemoConfig({})).toBeNull();
  });

  test("null when any required variable is missing", () => {
    for (const k of [
      "DEMO_SOURCE_TENANT_IDS",
      "DEMO_TENANT_IDS",
      "DEMO_USER_ID",
    ]) {
      const env = { ...FULL, [k]: "" };
      expect(readDemoConfig(env)).toBeNull();
    }
  });

  test("mismatched source/dest lists yield null rather than a guessed pairing", () => {
    // The one misconfiguration that could copy the wrong budget into a public
    // login. Refusing is the only acceptable behaviour.
    expect(readDemoConfig({ ...FULL, DEMO_TENANT_IDS: "xxx" })).toBeNull();
  });

  test("pairs sources to destinations positionally", () => {
    const cfg = readDemoConfig(FULL)!;
    expect(cfg.pairs.map((p) => [p.source, p.dest])).toEqual([
      ["aaa", "xxx"],
      ["bbb", "yyy"],
    ]);
  });

  test("relabels the home currency only when the destination differs", () => {
    const cfg = readDemoConfig(FULL)!;
    // personal: PLN → USD
    expect(cfg.pairs[0]!.currency).toBe("USD");
    expect(cfg.pairs[0]!.currencyMap).toEqual({ PLN: "USD" });
    // family: stays PLN, so no relabel at all
    expect(cfg.pairs[1]!.currency).toBe("PLN");
    expect(cfg.pairs[1]!.currencyMap).toEqual({});
  });
});

describe("scaleForPair", () => {
  test("draws a different factor per day and per pair", () => {
    const cfg = readDemoConfig(FULL)!;
    const [personal, family] = cfg.pairs;
    expect(scaleForPair(cfg, personal!, "2026-08-29")).not.toBe(
      scaleForPair(cfg, personal!, "2026-08-30"),
    );
    expect(scaleForPair(cfg, personal!, "2026-08-29")).not.toBe(
      scaleForPair(cfg, family!, "2026-08-29"),
    );
  });

  test("stays inside [0.1, 10] across a year", () => {
    const cfg = readDemoConfig(FULL)!;
    for (let d = 0; d < 365; d++) {
      const s = scaleForPair(cfg, cfg.pairs[0]!, `2026-day-${d}`);
      expect(s).toBeGreaterThanOrEqual(0.1);
      expect(s).toBeLessThanOrEqual(10);
    }
  });

  test("an explicit DEMO_MONEY_SCALE pins the factor (tests only)", () => {
    const cfg = readDemoConfig({ ...FULL, DEMO_MONEY_SCALE: "0.25" })!;
    expect(scaleForPair(cfg, cfg.pairs[0]!, "any-day")).toBe(0.25);
  });

  test("a nonsense DEMO_MONEY_SCALE is ignored rather than obeyed", () => {
    for (const bad of ["0", "-1", "abc"]) {
      const cfg = readDemoConfig({ ...FULL, DEMO_MONEY_SCALE: bad })!;
      expect(cfg.fixedMoneyScale).toBeUndefined();
    }
  });
});
