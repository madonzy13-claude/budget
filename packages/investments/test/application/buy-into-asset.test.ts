/**
 * buy-into-asset.test.ts — Swap → Buy (13.1 D-08). Quantity buys convert cost
 * into the asset's cost currency at the entry date; cash adds raise cost and
 * value alike; a broker add books the deposit and refreshes the value.
 */
import { describe, test, expect } from "bun:test";
import { buyIntoAsset } from "../../src/application/buy-into-asset";
import { MemoryWorld, hold, T, U } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
function world(h: Parameters<typeof hold>[0], rate = "1") {
  const w = new MemoryWorld([hold(h)]);
  const asked: string[] = [];
  const fx = {
    rateAsOf: async (from: string, to: string, d: Date) => {
      asked.push(`${from}>${to}@${d.toISOString().slice(0, 10)}`);
      return { rate, provider: "stub", isStale: false };
    },
  } as never;
  return {
    w,
    asked,
    buy: buyIntoAsset({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: fx,
    }),
  };
}

describe("Buy into an asset", () => {
  test("a quantity buy in EUR converts the cost at the entry date into the PLN cost basis", async () => {
    const { w, asked, buy } = world(
      {
        id: "btc",
        uiType: "crypto",
        holdingType: "crypto",
        buy: 20_000_000n,
        qty: "1",
        current: null,
      },
      "4.3",
    );
    const r = await buy({
      ...who,
      holdingId: "btc",
      kind: "quantity",
      quantity: "0.5",
      priceCents: "6400000",
      currency: "EUR",
      effectiveDate: "2026-10-01",
    });
    expect(r.isOk()).toBe(true);
    expect(asked).toEqual(["EUR>PLN@2026-10-01"]);
    expect(w.get("btc").quantity).toBe("1.5");
    // (20,000,000 + 3,200,000 × 4.3) / 1.5
    expect(w.get("btc").buyPriceCents).toBe(22_506_667n);
    const e = w.live()[0]!;
    expect(e).toMatchObject({
      kind: "buy",
      qtyDelta: "0.5",
      costDeltaCents: 13_760_000n,
      flowCents: 3_200_000n,
      amountCurrency: "EUR",
    });
  });

  test("cash: cost and value rise alike, prior value kept for undo", async () => {
    const { w, buy } = world({
      id: "c",
      uiType: "cash",
      holdingType: "cash_fx",
      buy: 100_000n,
      current: 100_000n,
    });
    await buy({
      ...who,
      holdingId: "c",
      kind: "amount",
      amountCents: "50000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    expect(w.get("c").buyPriceCents).toBe(150_000n);
    expect(String(w.get("c").currentPriceCents)).toBe("150000");
    expect(w.live()[0]).toMatchObject({
      kind: "add",
      costDeltaCents: 50_000n,
      valueDeltaCents: 50_000n,
      flowCents: 50_000n,
      priorPriceCents: "100000",
    });
  });

  test("broker: the deposit is cost + contribution, the rest of the value change is market move", async () => {
    const { w, buy } = world({
      id: "b",
      uiType: "broker",
      holdingType: "other",
      buy: 10_000_000n,
      current: 12_000_000n,
    });
    await buy({
      ...who,
      holdingId: "b",
      kind: "broker",
      amountCents: "1000000",
      valueAfterCents: "13325000",
      effectiveDate: "2026-10-01",
    });
    expect(w.get("b").buyPriceCents).toBe(11_000_000n);
    expect(String(w.get("b").currentPriceCents)).toBe("13325000");
    expect(w.live()[0]).toMatchObject({
      kind: "add",
      costDeltaCents: 1_000_000n,
      flowCents: 1_000_000n,
      valueDeltaCents: 1_325_000n,
      priorPriceCents: "12000000",
    });
  });

  test("a deposit cannot be bought into", async () => {
    const { buy } = world({
      id: "d",
      uiType: "deposit",
      holdingType: "deposit",
      buy: 100n,
      current: null,
    });
    const r = await buy({
      ...who,
      holdingId: "d",
      kind: "amount",
      amountCents: "1",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    expect(r._unsafeUnwrapErr().message).toBe("deposit_not_allowed");
  });

  test("a body for the wrong shape is refused", async () => {
    const { buy } = world({
      id: "b",
      uiType: "broker",
      holdingType: "other",
      buy: 1n,
      current: 1n,
    });
    const r = await buy({
      ...who,
      holdingId: "b",
      kind: "quantity",
      quantity: "1",
      priceCents: "1",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    expect(r._unsafeUnwrapErr().message).toBe("shape_mismatch");
  });

  test("an archived asset is revived by a buy", async () => {
    const { w, buy } = world({
      id: "x",
      uiType: "crypto",
      holdingType: "crypto",
      buy: 0n,
      qty: "0",
      current: null,
      archived: true,
    });
    await buy({
      ...who,
      holdingId: "x",
      kind: "quantity",
      quantity: "1",
      priceCents: "100",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    expect(w.get("x").archivedAt).toBeNull();
  });
});
