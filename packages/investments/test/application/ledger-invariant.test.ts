/**
 * ledger-invariant.test.ts — UAT 13.1 test 12: an asset's totals always equal
 * the sum of the entries its ledger lists. Every write use case runs through
 * the memory world and every touched asset is checked afterwards.
 */
import { describe, test, expect } from "bun:test";
import { createHolding } from "../../src/application/create-holding";
import { buyIntoAsset } from "../../src/application/buy-into-asset";
import { sellHolding } from "../../src/application/sell-holding";
import { transferAsset } from "../../src/application/transfer-asset";
import { editAsset } from "../../src/application/edit-asset";
import { deleteEntry } from "../../src/application/delete-entry";
import { entry } from "../../src/ports/history-repo";
import {
  MemoryWorld,
  expectRowMatchesEntries,
  hold,
  T,
  U,
  rates1,
} from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
const INST = "33333333-3333-3333-3333-333333333333";

function world() {
  const w = new MemoryWorld();
  const deps = {
    holdingRepo: w.holdingRepo,
    historyRepo: w.historyRepo,
    fxProvider: rates1,
  };
  const create = createHolding(deps);
  return {
    w,
    buy: buyIntoAsset(deps),
    sell: sellHolding(deps),
    move: transferAsset(deps),
    edit: editAsset(deps),
    del: deleteEntry(deps),
    btc: async (name = "BTC", quantity = "2", buyPriceCents = "100000") =>
      (
        await create({
          ...who,
          name,
          holdingType: "crypto",
          uiType: "crypto",
          instrumentId: INST,
          quantity,
          buyPriceCents,
          buyCurrency: "PLN",
          currentPriceCents: "120000",
          openedOn: "2026-09-01",
        })
      )._unsafeUnwrap().holding.id,
    broker: async (name = "IKE") =>
      (
        await create({
          ...who,
          name,
          holdingType: "other",
          uiType: "broker",
          quantity: "1",
          buyPriceCents: "1600000",
          buyCurrency: "PLN",
          currentPriceCents: "2000000",
          openedOn: "2026-09-01",
        })
      )._unsafeUnwrap().holding.id,
  };
}

const check = (w: MemoryWorld) => {
  for (const id of w.holdings.keys()) expectRowMatchesEntries(w, id);
};
const newest = (w: MemoryWorld, id: string) => w.newest(id)!.id;

describe("Asset ledger invariant", () => {
  test("the helper fails on a row that disagrees with its entries", async () => {
    const w = new MemoryWorld([
      hold({
        id: "btc",
        holdingType: "crypto",
        uiType: "crypto",
        buy: 100_000n,
        qty: "0.5",
        current: null,
      }),
    ]);
    await w.historyRepo.commit(T, U, {
      budgetId: T,
      patches: [],
      entries: [
        entry({
          holdingRef: "btc",
          kind: "convert_in",
          effectiveDate: "2026-10-27",
          qtyDelta: "0.5",
          costDeltaCents: 50_000n,
        }),
        entry({
          holdingRef: "btc",
          kind: "buy",
          effectiveDate: "2026-10-27",
          qtyDelta: "1.6",
          costDeltaCents: 12_758_240n,
        }),
      ],
    });
    expect(() => expectRowMatchesEntries(w, "btc")).toThrow(/qty 0.5/);
  });

  // Round-5: names are not unique — a second Add is a second asset.
  test("create twice under one name", async () => {
    const { w, btc } = world();
    await btc();
    check(w);
    await btc(" btc ", "1.5", "130000");
    expect(w.holdings.size).toBe(2);
    check(w);
  });

  test("buy by quantity, by amount and into a broker", async () => {
    const { w, btc, broker, buy } = world();
    const b = await btc();
    const k = await broker();
    await buy({
      ...who,
      holdingId: b,
      kind: "quantity",
      quantity: "0.3",
      priceCents: "110000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    await buy({
      ...who,
      holdingId: k,
      kind: "broker",
      amountCents: "100000",
      valueAfterCents: "2200000",
      effectiveDate: "2026-10-01",
    });
    check(w);
  });

  test("sell part, sell into new and existing assets, sell all out", async () => {
    const { w, btc, broker, sell } = world();
    const b = await btc();
    const k = await broker();
    await sell({
      ...who,
      holdingId: b,
      effectiveDate: "2026-10-02",
      left: { quantity: "1.5" },
      destination: { kind: "out", wallet: { kind: "nowhere" } },
      receivedCents: "60000",
      receivedCurrency: "PLN",
    });
    check(w);
    await sell({
      ...who,
      holdingId: b,
      effectiveDate: "2026-10-03",
      left: { quantity: "1" },
      destination: { kind: "existing", holdingId: k },
      receivedCents: "60000",
      receivedCurrency: "PLN",
    });
    check(w);
    await sell({
      ...who,
      holdingId: k,
      effectiveDate: "2026-10-04",
      left: { valueCents: "1000000" },
      destination: {
        kind: "new",
        holding: {
          name: "Cash",
          holdingType: "cash_fx",
          uiType: "cash",
          quantity: "1",
        },
      },
      receivedCents: "500000",
      receivedCurrency: "PLN",
    });
    check(w);
    await sell({
      ...who,
      holdingId: b,
      effectiveDate: "2026-10-05",
      left: { quantity: "0" },
      destination: { kind: "out", wallet: { kind: "nowhere" } },
      receivedCents: "120000",
      receivedCurrency: "PLN",
    });
    check(w);
  });

  test("transfer part and all, by quantity and by value", async () => {
    const { w, btc, broker, move } = world();
    const a = await btc();
    const b = await btc("BTC Cold", "1", "80000");
    await move({
      ...who,
      holdingId: a,
      effectiveDate: "2026-10-02",
      move: { quantity: "0.5" },
      to: { kind: "existing", holdingId: b },
    });
    check(w);
    await move({
      ...who,
      holdingId: a,
      effectiveDate: "2026-10-03",
      move: { quantity: "1.5" },
      to: { kind: "new", name: "BTC Ledger" },
    });
    check(w);
    const k = await broker();
    await move({
      ...who,
      holdingId: k,
      effectiveDate: "2026-10-03",
      move: { valueCents: "500000" },
      to: { kind: "new", name: "IKZE" },
    });
    check(w);
  });

  test("value and price updates", async () => {
    const { w, btc, broker, edit } = world();
    const b = await btc();
    const k = await broker();
    await edit({ ...who, holdingId: k, currentValueCents: "2500000" } as never);
    await edit({ ...who, holdingId: b, currentPriceCents: "150000" } as never);
    check(w);
  });

  test("deleting the newest entry of every kind keeps the row in step", async () => {
    const { w, btc, broker, buy, sell, move, edit, del } = world();
    const a = await btc();
    const b = await btc("BTC Cold", "1", "80000");
    const k = await broker();
    await buy({
      ...who,
      holdingId: a,
      kind: "quantity",
      quantity: "0.3",
      priceCents: "110000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    await sell({
      ...who,
      holdingId: a,
      effectiveDate: "2026-10-02",
      left: { quantity: "1.8" },
      destination: { kind: "existing", holdingId: k },
      receivedCents: "60000",
      receivedCurrency: "PLN",
    });
    await move({
      ...who,
      holdingId: a,
      effectiveDate: "2026-10-03",
      move: { quantity: "0.8" },
      to: { kind: "existing", holdingId: b },
    });
    await edit({ ...who, holdingId: k, currentValueCents: "2500000" } as never);
    check(w);
    // Unwind newest-first on each asset until only the opening entries remain.
    for (const id of [b, k, a, a]) {
      const r = await del({ ...who, entryId: newest(w, id) });
      expect(r.isOk() ? "ok" : r._unsafeUnwrapErr().message).toBe("ok");
      check(w);
    }
  });
});
