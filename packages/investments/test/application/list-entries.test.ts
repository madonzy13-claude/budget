/**
 * list-entries.test.ts — the L3 ledger read (13.1 D-12, D-13, D-16, D-19):
 * newest first, server-decided deletability, synthesized deposit interest.
 */
import { describe, test, expect } from "bun:test";
import { listEntries } from "../../src/application/list-entries";
import { sellHolding } from "../../src/application/sell-holding";
import { buyIntoAsset } from "../../src/application/buy-into-asset";
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
    list: listEntries(deps),
    sell: sellHolding(deps),
    buy: buyIntoAsset(deps),
    start: (
      holdingRef: string,
      d: string,
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
const eth = {
  id: "eth",
  name: "ETH",
  holdingType: "crypto",
  uiType: "crypto",
  buy: 1_000n,
  qty: "1",
  current: 1_000n,
};

describe("List an asset's entries", () => {
  test("newest first; only the newest is deletable", async () => {
    const { list, buy, start } = world(btc);
    await start("btc", "2026-09-01", {
      qtyDelta: "4",
      amountCents: 10_000n,
      amountCurrency: "PLN",
      backfilled: true,
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
    await buy({
      ...who,
      holdingId: "btc",
      kind: "quantity",
      quantity: "1",
      priceCents: "6000",
      currency: "PLN",
      effectiveDate: "2026-10-02",
    });
    const rows = (
      await list({ ...who, holdingId: "btc", today: "2026-10-27" })
    )._unsafeUnwrap();
    expect(
      rows.map((r) => [r.effectiveDate, r.deletable, r.blockedReason]),
    ).toEqual([
      ["2026-10-02", true, null],
      ["2026-10-01", false, "not_newest"],
      ["2026-09-01", false, "not_newest"],
    ]);
    expect(rows[0]).toMatchObject({
      kind: "buy",
      qtyDelta: "1",
      priceCents: "6000",
      amountCents: "6000",
      displayCurrency: "PLN",
      isLastEntry: false,
    });
    expect(rows[2]!.backfilled).toBe(true);
  });

  test("a linked leg whose partner has a later entry is linked_not_newest; names are filled", async () => {
    const { list, sell, buy, start, w } = world(btc, eth);
    w.wallets.set("wal", {
      id: "wal",
      name: "Bank",
      walletType: "SPENDINGS",
      currency: "PLN",
      balance: "0",
    });
    await start("btc", "2026-09-01");
    await start("eth", "2026-09-01");
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
    const rows = (
      await list({ ...who, holdingId: "btc", today: "2026-10-27" })
    )._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      kind: "convert_out",
      linked: true,
      counterpartyName: "ETH",
      deletable: false,
      blockedReason: "linked_not_newest",
      amountCents: "-3000",
    });
    expect(rows[0]!.realizedBudgetCents).toBe("500");
  });

  test("a wallet sale shows the wallet and the delta", async () => {
    const { list, sell, start, w } = world(btc);
    w.wallets.set("wal", {
      id: "wal",
      name: "Bank",
      walletType: "SPENDINGS",
      currency: "PLN",
      balance: "0",
    });
    await start("btc", "2026-09-01");
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
    const rows = (
      await list({ ...who, holdingId: "btc", today: "2026-10-27" })
    )._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      kind: "withdraw",
      walletName: "Bank",
      walletDelta: "30.00",
      deletable: true,
    });
  });

  test("a deposit interleaves read-only interest rows by date", async () => {
    const dep = {
      id: "d",
      name: "Bank 5%",
      holdingType: "deposit",
      uiType: "deposit",
      buy: 1_000_000n,
      current: null,
      rateBps: 500,
      start: "2026-07-01",
      cap: "monthly",
    };
    const { list, start } = world(dep);
    await start("d", "2026-07-01", {
      amountCents: 1_000_000n,
      amountCurrency: "PLN",
    });
    const rows = (
      await list({ ...who, holdingId: "d", today: "2026-10-15" })
    )._unsafeUnwrap();
    expect(rows.map((r) => [r.kind, r.effectiveDate])).toEqual([
      ["interest", "2026-10-01"],
      ["interest", "2026-09-01"],
      ["interest", "2026-08-01"],
      ["start", "2026-07-01"],
    ]);
    for (const r of rows.slice(0, 3))
      expect(r).toMatchObject({
        id: null,
        deletable: false,
        blockedReason: "interest",
      });
    expect(rows[3]).toMatchObject({ deletable: true, isLastEntry: true });
  });
});
