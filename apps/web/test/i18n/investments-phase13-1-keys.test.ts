/**
 * investments-phase13-1-keys.test.ts — every Phase 13.1 string (asset rows,
 * Swap sheet, L3 ledger, slim Edit, delete confirms, errors) exists in EN, PL
 * and UK with the same ICU placeholders. next-intl falls back silently, so a
 * missing translation would ship as English.
 */
import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import pl from "../../messages/pl.json";
import uk from "../../messages/uk.json";
import { createTranslator } from "next-intl";

const KEYS = [
  "asset.name.closed",
  "asset.name.create",
  "asset.name.pickOrCreate",
  "asset.name.pickedValue",
  "field.customName",
  "row.qtyAvg",
  "asset.name.label",
  "asset.name.reopens",
  "asset.swipe.edit",
  "asset.swipe.newTxn",
  "edit.currentPrice",
  "edit.currentValue",
  "edit.displayCurrency",
  "edit.displayCurrencyHelp",
  "edit.label",
  "edit.save",
  "edit.saved",
  "ledger.confirm.entry.body",
  "ledger.confirm.entry.cancel",
  "ledger.confirm.entry.confirm",
  "ledger.confirm.entry.title",
  "ledger.confirm.last.body",
  "ledger.confirm.last.cancel",
  "ledger.confirm.last.confirm",
  "ledger.confirm.last.title",
  "ledger.confirm.linked.body",
  "ledger.confirm.linked.cancel",
  "ledger.confirm.linked.confirm",
  "ledger.confirm.linked.title",
  "ledger.confirm.wallet.body",
  "ledger.confirm.wallet.cancel",
  "ledger.confirm.wallet.confirm",
  "ledger.confirm.wallet.title",
  "ledger.deleteAria",
  "ledger.deleted",
  "ledger.fromAsset",
  "ledger.kind.added",
  "ledger.kind.bought",
  "ledger.kind.convertedIn",
  "ledger.kind.convertedOut",
  "ledger.kind.interest",
  "ledger.kind.priceUpdated",
  "ledger.kind.sold",
  "ledger.kind.transferIn",
  "ledger.kind.transferOut",
  "ledger.kind.valueUpdated",
  "ledger.onlyLatest",
  "ledger.realized",
  "ledger.removeLaterIn",
  "ledger.toAsset",
  "swap.buy.amountAdded",
  "swap.buy.cashHelp",
  "swap.buy.price",
  "swap.buy.quantity",
  "swap.buy.split",
  "swap.buy.total",
  "swap.buy.valueAfter",
  "swap.buy.valueAfterHelp",
  "swap.cta.buy",
  "swap.cta.sell",
  "swap.cta.sellOut",
  "swap.cta.transfer",
  "swap.cta.transferNoTarget",
  "swap.dateMin",
  "swap.discard",
  "swap.err.beforeLatest",
  "swap.err.futureDate",
  "swap.err.fx",
  "swap.err.soldRange",
  "swap.err.nameRequired",
  "swap.err.positive",
  "swap.err.received",
  "swap.err.saveFailed",
  "swap.err.staleEntry",
  "swap.err.walletRequired",
  "swap.locked",
  "swap.saving",
  "swap.sell.dest.invest",
  "swap.sell.dest.investDesc",
  "swap.sell.dest.willCreate",
  "swap.sell.dest.out",
  "swap.sell.dest.outDesc",
  "swap.sell.sold",
  "swap.sell.received",
  "swap.sell.receivedHelp",
  "swap.sell.wallet.existing",
  "swap.sell.wallet.help",
  "swap.sell.wallet.name",
  "swap.sell.wallet.new",
  "swap.sell.wallet.newHelp",
  "swap.sell.wallet.nowhere",
  "swap.sell.wallet.type",
  "swap.sell.walletTitle",
  "swap.sell.where",
  "swap.sellTitle",
  "swap.sum.created",
  "swap.sum.gone",
  "swap.sum.leaves",
  "swap.sum.line",
  "swap.sum.plUnchanged",
  "swap.sum.realized",
  "swap.sum.realizedUnchanged",
  "swap.sum.title",
  "swap.sum.walletNew",
  "swap.tab.buy",
  "swap.tab.sell",
  "swap.tab.transfer",
  "swap.title",
  "swap.transfer.moveAmount",
  "swap.transfer.moveQty",
  "swap.transfer.note",
  "swap.transfer.sameInstrument",
  "swap.transfer.to",
  "typeGroup.stats.avgPrice",
  "typeGroup.unrealizedLabel",
  "typeGroup.realizedLabel",
  "ledger.confirm.interestNote",
  "ledger.openLinked",
  "swap.err.overHeld",
  "heldUnit.g",
  "heldUnit.oz",
  "heldUnit.kg",
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

describe("Phase 13.1 investments i18n keys", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["pl", pl],
    ["uk", uk],
  ] as const) {
    it(`${locale} has every Phase 13.1 key as a non-empty string`, () => {
      const missing = KEYS.filter((k) => {
        const v = at(messages, k);
        return typeof v !== "string" || v.trim() === "";
      });
      expect(missing).toEqual([]);
    });
  }

  it("translations keep the same ICU placeholders as en", () => {
    const ph = (s: unknown) =>
      [
        ...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
      ].sort();
    const drift = KEYS.filter(
      (k) =>
        JSON.stringify(ph(at(pl, k))) !== JSON.stringify(ph(at(en, k))) ||
        JSON.stringify(ph(at(uk, k))) !== JSON.stringify(ph(at(en, k))),
    );
    expect(drift).toEqual([]);
  });
});

// Round-5 scope change: no "name taken" message survives.
describe("No uniqueness copy", () => {
  it("asset.name.taken is gone in every locale", () => {
    for (const m of [en, pl, uk])
      expect(at(m, "asset.name.taken")).toBeUndefined();
  });
});

// Round-5 gaps 2 + 5 (user): uk wording, and the unit in "you hold".
describe("Round-5 investments copy", () => {
  it("uk ledger kinds and type names read as requested", () => {
    expect({
      convertedOut: at(uk, "ledger.kind.convertedOut"),
      added: at(uk, "ledger.kind.added"),
      transferOut: at(uk, "ledger.kind.transferOut"),
      convertedIn: at(uk, "ledger.kind.convertedIn"),
      transferIn: at(uk, "ledger.kind.transferIn"),
      uiCrypto: at(uk, "uitype.crypto"),
      typeCrypto: at(uk, "type.crypto"),
      collectibles: at(uk, "uitype.collectibles"),
    }).toEqual({
      convertedOut: "Продаж",
      added: "Купівля",
      transferOut: "Переказ",
      convertedIn: "Купівля",
      transferIn: "Надходження",
      uiCrypto: "Криптовалюти",
      typeCrypto: "Криптовалюти",
      collectibles: "Цінності",
    });
  });

  it("uk qty line reads 'сер. ціна купівлі'", () => {
    expect(at(uk, "row.qtyAvg")).toBe("{qty} × {avg} сер. ціна купівлі");
  });

  it("pl ledger kinds read as requested", () => {
    expect({
      added: at(pl, "ledger.kind.added"),
      convertedIn: at(pl, "ledger.kind.convertedIn"),
      convertedOut: at(pl, "ledger.kind.convertedOut"),
    }).toEqual({
      added: "Zakup",
      convertedIn: "Zakup",
      convertedOut: "Sprzedaż",
    });
  });

  it("metal units take the right plural", () => {
    const tr = (locale: string, messages: unknown) =>
      createTranslator({
        locale,
        messages: messages as never,
        namespace: "budget.investments" as never,
      }) as unknown as (k: string, v: Record<string, unknown>) => string;
    const t = tr("uk", uk);
    expect(t("heldUnit.oz", { qty: "1", n: 1 })).toBe("1 унція");
    expect(t("heldUnit.oz", { qty: "3", n: 3 })).toBe("3 унції");
    expect(t("heldUnit.oz", { qty: "5", n: 5 })).toBe("5 унцій");
    expect(t("heldUnit.oz", { qty: "2.5", n: 2.5 })).toBe("2.5 унції");
    expect(tr("en", en)("heldUnit.oz", { qty: "3", n: 3 })).toBe("3 oz");
    expect(tr("pl", pl)("heldUnit.g", { qty: "5", n: 5 })).toBe("5 gramów");
  });
});
