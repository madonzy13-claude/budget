/**
 * list-entries.test.ts — the L3 ledger read (13.1 D-12, D-13, D-16, D-19):
 * newest first, server-decided deletability, synthesized deposit interest.
 */
import { describe, test, expect } from "bun:test";
import { listEntries } from "../../src/application/list-entries";
import { sellHolding } from "../../src/application/sell-holding";
import { buyIntoAsset } from "../../src/application/buy-into-asset";
import { entry } from "../../src/ports/history-repo";
import { computeDepositValueCents } from "../../src/domain/deposit-value";
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

  // R6 (user): "+15 USD" after a 20,000 USD swap the same day jumped the
  // total by 10k — the small swap's fee'd price valued the whole holding.
  // A day's deals share one price: their volume-weighted average.
  test("the total after an entry uses its day's weighted deal price", async () => {
    const { list, buy, start } = world({ ...btc, qty: "2" });
    await start("btc", "2026-09-01", {
      qtyDelta: "2",
      amountCents: 4_000n,
      amountCurrency: "PLN",
      backfilled: true,
    });
    for (const [quantity, priceCents] of [
      ["1", "3000"],
      ["0.01", "3300"], // a tiny swap, 10% worse
    ])
      await buy({
        ...who,
        holdingId: "btc",
        kind: "quantity",
        quantity,
        priceCents,
        currency: "PLN",
        effectiveDate: "2026-10-01",
      });
    const rows = (
      await list({ ...who, holdingId: "btc", today: "2026-10-27" })
    )._unsafeUnwrap();
    // (3,000 + 33) ÷ 1.01 = 3,002.97 a unit on 2026-10-01.
    expect(rows.map((r) => r.afterCents)).toEqual(["9039", "9009", "4000"]);
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

  // Round-4 gap 10: a linked leg names its partner so the ledger can open it.
  test("a linked leg exposes its partner asset and transfer id; a plain entry does not", async () => {
    const { list, sell, start } = world(btc, eth);
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
    const rows = (
      await list({ ...who, holdingId: "btc", today: "2026-10-27" })
    )._unsafeUnwrap();
    expect(rows[0]!.counterpartyHoldingId).toBe("eth");
    expect(rows[0]!.transferId).toEqual(expect.any(String));
    const start0 = rows.find((r) => r.kind === "start")!;
    expect(start0).toMatchObject({
      counterpartyHoldingId: null,
      transferId: null,
    });
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

  // Round-2 gap 13: a quantity-type asset priced as one unit (qty 1, value
  // entries store no quantity) still reads "±1 @ price" like crypto.
  test("a one-unit quantity asset shows ±1 @ amount on its value entries", async () => {
    const diamonds = {
      id: "dia",
      name: "Diamonds",
      holdingType: "other",
      uiType: "collectibles",
      buy: 300_000n,
      qty: "1",
      current: 300_000n,
    };
    const { list, start } = world(diamonds);
    await start("dia", "2026-10-01", {
      amountCents: 300_000n,
      amountCurrency: "PLN",
    });
    const [row] = (
      await list({ ...who, holdingId: "dia", today: "2026-10-15" })
    )._unsafeUnwrap();
    expect(row).toMatchObject({
      qtyDelta: null,
      displayQty: "1",
      priceCents: "300000",
    });
  });

  test("an amount asset keeps plain amounts (no qty @ price)", async () => {
    const ibkr = {
      id: "ib",
      name: "IBKR",
      holdingType: "other",
      uiType: "broker",
      buy: 500_000n,
      qty: "1",
      current: 500_000n,
    };
    const { list, start } = world(ibkr);
    await start("ib", "2026-10-01", {
      amountCents: 500_000n,
      amountCurrency: "PLN",
    });
    const [row] = (
      await list({ ...who, holdingId: "ib", today: "2026-10-15" })
    )._unsafeUnwrap();
    expect(row).toMatchObject({ displayQty: null, priceCents: null });
  });

  test("a real quantity entry shows its own quantity", async () => {
    const { list, start } = world(btc);
    await start("btc", "2026-10-01", {
      qtyDelta: "4",
      amountCents: 10_000n,
      amountCurrency: "PLN",
    });
    const [row] = (
      await list({ ...who, holdingId: "btc", today: "2026-10-15" })
    )._unsafeUnwrap();
    expect(row).toMatchObject({ displayQty: "4", priceCents: "2500" });
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
      ["interest", "2026-10-15"],
      ["interest", "2026-10-01"],
      ["interest", "2026-09-01"],
      ["interest", "2026-08-01"],
      ["start", "2026-07-01"],
    ]);
    for (const r of rows.slice(0, 4))
      expect(r).toMatchObject({
        id: null,
        deletable: false,
        blockedReason: "interest",
      });
    expect(rows[4]).toMatchObject({ deletable: true, isLastEntry: true });
  });

  test("a yearly deposit younger than a year shows its accrued interest dated today", async () => {
    const dep = {
      id: "d",
      name: "Bank 5%",
      holdingType: "deposit",
      uiType: "deposit",
      buy: 1_000_000n,
      current: null,
      rateBps: 500,
      start: "2026-07-01",
      cap: "yearly",
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
      ["interest", "2026-10-15"],
      ["start", "2026-07-01"],
    ]);
    const accrued =
      BigInt(
        computeDepositValueCents({
          principalCents: 1_000_000n,
          rateBps: 500,
          startDate: "2026-07-01",
          capFrequency: "yearly",
          endDate: null,
          asOf: "2026-10-15",
        }),
      ) - 1_000_000n;
    expect(rows[0]).toMatchObject({
      id: null,
      deletable: false,
      blockedReason: "interest",
      amountCents: accrued.toString(),
    });
  });
});

// Round-6 gap 2: a recorded deal is never re-converted.
describe("Deal figure in the ledger", () => {
  const spyFx = (rate: string) => {
    const calls: string[] = [];
    return {
      calls,
      fx: {
        rateAsOf: async (f: string, t: string) => {
          calls.push(`${f}>${t}`);
          return { rate, provider: "stub", isStale: false };
        },
      } as never,
    };
  };
  const diamonds = {
    id: "dia",
    name: "Diamonds",
    holdingType: "other",
    uiType: "collectibles",
    buy: 0n,
    qty: "1",
    current: 0n,
  };
  const listWith = (fx: never, assetAmountCents: bigint | null) => {
    const w = new MemoryWorld([hold(diamonds)]);
    void w.historyRepo.commit(T, U, {
      budgetId: T,
      patches: [],
      entries: [
        entry({
          holdingRef: "dia",
          kind: "convert_out",
          effectiveDate: "2026-10-28",
          amountCents: 69_000n,
          amountCurrency: "EUR",
          costDeltaCents: -300_000n,
          costCurrency: "PLN",
          assetAmountCents,
        } as never),
      ],
    });
    return listEntries({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: fx,
    })({ ...who, holdingId: "dia", today: "2026-10-30" });
  };

  test("the stored figure shows as is, with no FX lookup", async () => {
    const s = spyFx("4.41");
    const rows = (await listWith(s.fx, 300_000n))._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      displayAmountCents: "-300000",
      displayCurrency: "PLN",
    });
    expect(s.calls).toHaveLength(0);
  });

  test("without a stored figure it falls back to today's conversion", async () => {
    const s = spyFx("4.41");
    const rows = (await listWith(s.fx, null))._unsafeUnwrap();
    expect(rows[0]!.displayAmountCents).toBe("-304290");
  });

  test("an asset priced in another currency than it was bought shows the stored currency", async () => {
    const s = spyFx("0.9");
    const w = new MemoryWorld([
      hold({ ...diamonds, buyCcy: "USD", curCcy: "EUR" }),
    ]);
    await w.historyRepo.commit(T, U, {
      budgetId: T,
      patches: [],
      entries: [
        entry({
          holdingRef: "dia",
          kind: "convert_out",
          effectiveDate: "2026-10-28",
          amountCents: 40_000n,
          amountCurrency: "PLN",
          costDeltaCents: -50_000n,
          costCurrency: "USD",
          assetAmountCents: 50_000n,
        } as never),
      ],
    });
    const rows = (
      await listEntries({
        holdingRepo: w.holdingRepo,
        historyRepo: w.historyRepo,
        fxProvider: s.fx,
      })({ ...who, holdingId: "dia", today: "2026-10-30" })
    )._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      displayAmountCents: "-50000",
      displayCurrency: "USD",
    });
    expect(s.calls).toHaveLength(0);
  });
});

// R6 (user): realized read in PLN for a USD asset — it belongs in the
// ASSET's currency (not the budget's, not the transaction's).
describe("Realized in the asset's currency", () => {
  const listSale = (
    assetCcy: string,
    rate: string,
    extra: Record<string, unknown> = {},
  ) => {
    const calls: string[] = [];
    const fx = {
      rateAsOf: async (f: string, t: string, d: Date) => {
        calls.push(`${f}>${t}@${d.toISOString().slice(0, 10)}`);
        return { rate, provider: "stub", isStale: false };
      },
    } as never;
    const w = new MemoryWorld([
      hold({ ...btc, buyCcy: assetCcy, curCcy: assetCcy }),
    ]);
    void w.historyRepo.commit(T, U, {
      budgetId: T,
      patches: [],
      entries: [
        entry({
          holdingRef: "btc",
          kind: "withdraw",
          effectiveDate: "2024-05-03",
          amountCents: 40_000n,
          amountCurrency: "EUR",
          realizedBudgetCents: 10_000n,
          budgetCurrency: "PLN",
          costCurrency: assetCcy,
          ...extra,
        } as never),
      ],
    });
    return {
      calls,
      rows: listEntries({
        holdingRepo: w.holdingRepo,
        historyRepo: w.historyRepo,
        fxProvider: fx,
      })({ ...who, holdingId: "btc", today: "2026-10-30" }),
    };
  };

  test("a USD asset sold for EUR reports realized in USD at the sale date's rate", async () => {
    const s = listSale("USD", "0.25");
    const rows = (await s.rows)._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      realizedBudgetCents: "10000",
      realizedCents: "2500",
      realizedCurrency: "USD",
    });
    expect(s.calls).toContain("PLN>USD@2024-05-03");
  });

  test("a stored deal figure gives the exact realized, no rate", async () => {
    const s = listSale("USD", "9", {
      assetAmountCents: 5_000n,
      costDeltaCents: -3_000n,
    });
    const rows = (await s.rows)._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      realizedCents: "2000",
      realizedCurrency: "USD",
    });
    expect(s.calls.filter((c) => c.startsWith("PLN>"))).toHaveLength(0);
  });

  test("an asset in the budget currency needs no rate", async () => {
    const s = listSale("PLN", "9");
    const rows = (await s.rows)._unsafeUnwrap();
    expect(rows[0]).toMatchObject({
      realizedCents: "10000",
      realizedCurrency: "PLN",
    });
    expect(s.calls.filter((c) => c.startsWith("PLN>"))).toHaveLength(0);
  });
});
