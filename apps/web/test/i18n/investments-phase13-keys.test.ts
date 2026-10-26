/**
 * investments-phase13-keys.test.ts — every Phase 13 string (sell flow, type
 * group headers, "what happened", history, delete) exists in EN, PL and UK.
 * next-intl falls back silently, so a missing translation would ship as English.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";

const KEYS = [
  "uitype.stocks",
  "sell.action",
  "sell.title",
  "sell.leftLabel",
  "sell.qtyLeft",
  "sell.valueLeft",
  "sell.qtyHelper",
  "sell.valueHelper",
  "sell.sellAll",
  "sell.destTitle",
  "sell.destNew",
  "sell.destNewDesc",
  "sell.destExisting",
  "sell.destExistingDesc",
  "sell.destOut",
  "sell.destOutDesc",
  "sell.received",
  "sell.receivedHelper",
  "sell.qtyBought",
  "sell.date",
  "sell.previewRow",
  "sell.previewRealized",
  "sell.submitSale",
  "sell.submitWithdraw",
  "sell.discard",
  "sell.saving",
  "sell.toastSale",
  "sell.toastWithdraw",
  "sell.errLeftTooHigh",
  "sell.errReceived",
  "sell.errFuture",
  "sell.errFx",
  "sell.errSave",
  "typeGroup.inclRealized",
  "typeGroup.unrealized",
  "typeGroup.realized",
  "typeGroup.totalPl",
  "typeGroup.lifetimeReturn",
  "whatHappened.title",
  "whatHappened.valueChanged",
  "whatHappened.valueChangedDesc",
  "whatHappened.added",
  "whatHappened.addedDesc",
  "whatHappened.withdrew",
  "whatHappened.withdrewDesc",
  "whatHappened.boughtMore",
  "whatHappened.soldSome",
  "whatHappened.saveValue",
  "whatHappened.saveAdded",
  "whatHappened.saveWithdraw",
  "changeTypeHelper",
  "history.title",
  "history.start",
  "history.buy",
  "history.add",
  "history.value_change",
  "history.withdraw",
  "history.convert_out",
  "history.convert_in",
  "history.automatic",
  "history.toHolding",
  "history.fromHolding",
  "history.realizedNote",
  "history.emptyTitle",
  "history.emptyBody",
  "history.deleteAria",
  "history.deleteTitle",
  "history.deleteBody",
  "history.deleteConfirm",
  "history.deleteKeep",
  "history.deleteConvTitle",
  "history.deleteConvBody",
  "history.errUndoLaterFirst",
  "history.errWouldEmpty",
  "history.deleteConvConfirm",
  "history.deleteConvKeep",
  "history.toastDeleted",
  "deleteHolding.title",
  "deleteHolding.body",
  "deleteHolding.confirm",
  "deleteHolding.keep",
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
