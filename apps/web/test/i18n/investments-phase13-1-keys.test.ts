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

const KEYS = [
  "asset.name.closed",
  "asset.name.create",
  "asset.name.joins",
  "asset.name.label",
  "asset.name.reopens",
  "asset.name.taken",
  "asset.swipe.edit",
  "asset.swipe.swap",
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
  "swap.sell.dest.existing",
  "swap.sell.dest.existingDesc",
  "swap.sell.dest.new",
  "swap.sell.dest.newDesc",
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
      [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const drift = KEYS.filter(
      (k) =>
        JSON.stringify(ph(at(pl, k))) !== JSON.stringify(ph(at(en, k))) ||
        JSON.stringify(ph(at(uk, k))) !== JSON.stringify(ph(at(en, k))),
    );
    expect(drift).toEqual([]);
  });
});
