/**
 * delete-entry.test.ts — the ledger's only edit is deleting the NEWEST entry
 * (13.1 D-14..D-18, D-21, D-24). A delete reverses exactly that entry; linked
 * legs go together and only when newest in both assets; the last entry wipes
 * the asset; a stale view (another entry appended meanwhile) is refused.
 */
import { describe, test, expect } from "bun:test";
import { deleteEntry } from "../../src/application/delete-entry";
import { buyIntoAsset } from "../../src/application/buy-into-asset";
import { sellHolding } from "../../src/application/sell-holding";
import { editAsset } from "../../src/application/edit-asset";
import { entry } from "../../src/ports/history-repo";
import { MemoryWorld, hold, T, U, rates1 } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
function world(...hs: Parameters<typeof hold>[0][]) {
  const w = new MemoryWorld(hs.map(hold));
  const deps = {
    holdingRepo: w.holdingRepo,
    historyRepo: w.historyRepo,
    fxProvider: rates1,
  };
  return {
    w,
    del: deleteEntry(deps),
    buy: buyIntoAsset(deps),
    sell: sellHolding(deps),
    edit: editAsset(deps),
    start: (
      holdingRef: string,
      d = "2026-09-01",
      extra: Record<string, unknown> = {},
    ) =>
      w.historyRepo.commit(T, U, {
        budgetId: T,
        patches: [],
        entries: [
          entry({ holdingRef, kind: "start", effectiveDate: d, ...extra }),
        ],
      }),
  };
}
const btc = {
  id: "btc",
  name: "BTC",
  holdingType: "crypto",
  uiType: "crypto",
  buy: 2_500n,
  qty: "4",
  current: 3_000n,
};
const newest = (w: MemoryWorld, id: string) => w.newest(id)!.id;

describe("Delete the newest entry", () => {
  test("undoing the newest buy restores quantity, cost and contributions", async () => {
    const { w, del, buy, start } = world(btc);
    await start("btc", "2026-09-01", {
      qtyDelta: "4",
      costDeltaCents: 10_000n,
    });
    await buy({
      ...who,
      holdingId: "btc",
      kind: "quantity",
      quantity: "1",
      priceCents: "5000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    const flowBefore = w.totals().flow;
    const r = await del({ ...who, entryId: newest(w, "btc") });
    expect(r.isOk()).toBe(true);
    expect(w.get("btc").quantity).toBe("4");
    expect(w.get("btc").buyPriceCents).toBe(2_500n);
    expect(w.totals().flow).toBe(flowBefore - 5_000n);
  });

  test("an older entry is refused", async () => {
    const { w, del, buy, start } = world(btc);
    await start("btc");
    const first = newest(w, "btc");
    await buy({
      ...who,
      holdingId: "btc",
      kind: "quantity",
      quantity: "1",
      priceCents: "5000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    expect(
      (await del({ ...who, entryId: first }))._unsafeUnwrapErr().message,
    ).toBe("not_newest");
  });

  test("linked legs are removed together when newest in both assets", async () => {
    const { w, del, sell, start } = world(btc, {
      id: "eth",
      name: "ETH",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 1_000n,
      qty: "1",
      current: 1_000n,
    });
    await start("btc");
    await start("eth");
    await sell({
      ...who,
      holdingId: "btc",
      effectiveDate: "2026-10-01",
      left: { quantity: "3" },
      destination: { kind: "existing", holdingId: "eth", quantityBought: "3" },
      receivedCents: "3000",
      receivedCurrency: "PLN",
    });
    const r = await del({ ...who, entryId: newest(w, "btc") });
    expect(r.isOk()).toBe(true);
    expect(w.get("btc").quantity).toBe("4");
    expect(w.get("eth").quantity).toBe("1");
    expect(w.live().filter((x) => x.transferId)).toHaveLength(0);
  });

  test("a linked leg is refused while the other asset has a later entry", async () => {
    const { w, del, sell, buy, start } = world(btc, {
      id: "eth",
      name: "ETH",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 1_000n,
      qty: "1",
      current: 1_000n,
    });
    await start("btc");
    await start("eth");
    await sell({
      ...who,
      holdingId: "btc",
      effectiveDate: "2026-10-01",
      left: { quantity: "3" },
      destination: { kind: "existing", holdingId: "eth", quantityBought: "3" },
      receivedCents: "3000",
      receivedCurrency: "PLN",
    });
    await buy({
      ...who,
      holdingId: "eth",
      kind: "quantity",
      quantity: "1",
      priceCents: "1000",
      currency: "PLN",
      effectiveDate: "2026-10-02",
    });
    expect(
      (await del({ ...who, entryId: newest(w, "btc") }))._unsafeUnwrapErr()
        .message,
    ).toBe("linked_not_newest");
  });

  test("a value update is undone from its snapshot, sub-cent exact (IN-04)", async () => {
    const { w, del, edit, start } = world({
      id: "c",
      name: "Pot",
      holdingType: "cash_fx",
      uiType: "cash",
      buy: 100n,
      current: "1234.567891",
    });
    await start("c");
    await edit({
      ...who,
      holdingId: "c",
      currentValueCents: "2000",
      today: "2026-10-27",
    });
    await del({ ...who, entryId: newest(w, "c") });
    expect(String(w.get("c").currentPriceCents)).toBe("1234.567891");
  });

  test("a broker add is undone: cost back, value back to the snapshot", async () => {
    const { w, del, buy, start } = world({
      id: "b",
      name: "IKE",
      holdingType: "other",
      uiType: "broker",
      buy: 10_000_000n,
      current: 12_000_000n,
    });
    await start("b");
    await buy({
      ...who,
      holdingId: "b",
      kind: "broker",
      amountCents: "1000000",
      valueAfterCents: "13325000",
      effectiveDate: "2026-10-01",
    });
    await del({ ...who, entryId: newest(w, "b") });
    expect(w.get("b").buyPriceCents).toBe(10_000_000n);
    expect(String(w.get("b").currentPriceCents)).toBe("12000000");
  });

  test("a deposit part-sale undo restores principal and start date", async () => {
    const dep = {
      id: "d",
      name: "Bank",
      holdingType: "deposit",
      uiType: "deposit",
      buy: 1_000_000n,
      current: null,
      rateBps: 500,
      start: "2026-01-01",
      cap: "monthly",
    };
    const { w, del, sell, start } = world(dep);
    await start("d", "2026-01-01");
    await sell({
      ...who,
      holdingId: "d",
      effectiveDate: "2026-10-01",
      left: { valueCents: "500000" },
      destination: { kind: "out" },
      receivedCents: "530000",
      receivedCurrency: "PLN",
    });
    await del({ ...who, entryId: newest(w, "d") });
    expect(w.get("d").buyPriceCents).toBe(1_000_000n);
    expect(w.get("d").depositStartDate).toBe("2026-01-01");
  });

  test("a sale paid into a wallet takes the delta back out, even after a manual edit; the wallet stays", async () => {
    const { w, del, sell, start } = world(btc);
    w.wallets.set("wal", {
      id: "wal",
      name: "Bank",
      walletType: "RESERVE",
      currency: "PLN",
      balance: "10",
    });
    await start("btc");
    await sell({
      ...who,
      holdingId: "btc",
      effectiveDate: "2026-10-01",
      left: { quantity: "3" },
      destination: {
        kind: "out",
        wallet: { kind: "existing", walletId: "wal" },
      },
      receivedCents: "3000",
      receivedCurrency: "PLN",
    });
    w.wallets.get("wal")!.balance = "100";
    const r = await del({ ...who, entryId: newest(w, "btc") });
    expect(r._unsafeUnwrap()).toMatchObject({
      walletId: "wal",
      walletType: "RESERVE",
    });
    expect(w.wallets.get("wal")!.balance).toBe("70.0000");
  });

  test("a deleted wallet never blocks the undo", async () => {
    const { w, del, sell, start } = world(btc);
    w.wallets.set("wal", {
      id: "wal",
      name: "Bank",
      walletType: "SPENDINGS",
      currency: "PLN",
      balance: "10",
    });
    await start("btc");
    await sell({
      ...who,
      holdingId: "btc",
      effectiveDate: "2026-10-01",
      left: { quantity: "3" },
      destination: {
        kind: "out",
        wallet: { kind: "existing", walletId: "wal" },
      },
      receivedCents: "3000",
      receivedCurrency: "PLN",
    });
    w.wallets.delete("wal");
    expect((await del({ ...who, entryId: newest(w, "btc") })).isOk()).toBe(
      true,
    );
  });

  test("deleting the only entry wipes the asset and its realized", async () => {
    const { w, del, start } = world(btc);
    await start("btc");
    const r = await del({ ...who, entryId: newest(w, "btc") });
    expect(r._unsafeUnwrap().wipedHoldingId).toBe("btc");
    expect(w.holdings.has("btc")).toBe(false);
  });

  test("undoing back to quantity 0 hides; undoing a sell-out revives", async () => {
    const { w, del, sell, buy, start } = world(btc);
    await start("btc", "2026-09-01", { qtyDelta: "4" });
    await sell({
      ...who,
      holdingId: "btc",
      effectiveDate: "2026-10-01",
      left: { quantity: "0" },
      destination: { kind: "out" },
      receivedCents: "3000",
      receivedCurrency: "PLN",
    });
    expect(w.get("btc").archivedAt).not.toBeNull();
    await buy({
      ...who,
      holdingId: "btc",
      kind: "quantity",
      quantity: "1",
      priceCents: "100",
      currency: "PLN",
      effectiveDate: "2026-10-02",
    });
    expect(w.get("btc").archivedAt).toBeNull();
    await del({ ...who, entryId: newest(w, "btc") });
    expect(w.get("btc").quantity).toBe("0");
    expect(w.get("btc").archivedAt).not.toBeNull();
    await del({ ...who, entryId: newest(w, "btc") });
    expect(w.get("btc").quantity).toBe("4");
    expect(w.get("btc").archivedAt).toBeNull();
  });

  test("a stale view (an entry appended since) is refused", async () => {
    const { w, del, start } = world(btc);
    await start("btc");
    const id = newest(w, "btc");
    const orig = w.historyRepo.listForHolding.bind(w.historyRepo);
    // Simulate a concurrent append between the read and the commit.
    w.historyRepo.listForHolding = async (...a) => {
      const rows = await orig(...a);
      await start("btc", "2026-10-05");
      w.historyRepo.listForHolding = orig;
      return rows;
    };
    expect(
      (await del({ ...who, entryId: id }))._unsafeUnwrapErr().message,
    ).toBe("stale");
  });
});
