/**
 * investments-phase13-keys.test.ts — every Phase 13 string still in use (13.1 removed
 * the Sell sheet, "what happened", History and asset-delete copy) (sell flow, type
 * group headers, "what happened", history, delete) exists in EN, PL and UK.
 * next-intl falls back silently, so a missing translation would ship as English.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const KEYS = [
  "uitype.stocks",
  "sell.qtyLeft",
  "sell.valueLeft",
  "sell.qtyHelper",
  "sell.valueHelper",
  "sell.date",
  "sell.toastSale",
  "sell.toastWithdraw",
  "addDate",
];

const at = (m: unknown, path: string): unknown =>
  `budget.investments.${path}`
    .split(".")
    .reduce<unknown>(
      (o, k) =>
        o && typeof o === "object"
          ? (o as Record<string, unknown>)[k]
          : undefined,
      m,
    );

describe("Phase 13 investments i18n keys", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["pl", pl],
    ["uk", uk],
  ] as const) {
    it(`${locale} has every Phase 13 key as a non-empty string`, () => {
      const missing = KEYS.filter((k) => {
        const v = at(messages, k);
        return typeof v !== "string" || v.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }

  it("translations keep the same ICU placeholders as en", () => {
    const ph = (s: unknown) =>
      [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const drift = KEYS.filter(
      (k) =>
        JSON.stringify(ph(at(pl, k))) !== JSON.stringify(ph(at(en, k))) ||
        JSON.stringify(ph(at(uk, k))) !== JSON.stringify(ph(at(en, k))),
    );
    expect(drift).toEqual([]);
  });
});
