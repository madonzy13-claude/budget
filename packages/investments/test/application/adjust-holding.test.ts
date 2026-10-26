/**
 * adjust-holding.test.ts — Phase 13 Edit "What happened?" (D-03) and the
 * PATCH cost-basis guard. Withdrew money books exactly like Sell → Out.
 */
import { describe, test, expect } from "bun:test";
import { adjustHolding } from "../../src/application/adjust-holding";
import { sellHolding } from "../../src/application/sell-holding";
import { updateHolding } from "../../src/application/update-holding";
import { MemoryWorld, hold, rates1, T, U } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
const date = "2026-10-25";

function world() {
  const w = new MemoryWorld([
    hold({
      id: "broker",
      uiType: "broker",
      buy: 5_500_000n,
      current: 9_600_000n,
    }),
    hold({
      id: "btc",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 2_500_000n,
      qty: "0.4",
      current: 6_000_000n,
    }),
  ]);
  const deps = {
    holdingRepo: w.holdingRepo,
    historyRepo: w.historyRepo,
    fxProvider: rates1,
  };
  const adjust = adjustHolding({ ...deps, sellHolding: sellHolding(deps) });
  return { w, adjust };
}

describe("Edit: what happened?", () => {
  test("withdrew money 96k → 80k books like Sell → Out (D-03)", async () => {
    const { w, adjust } = world();
    const r = await adjust({
      ...who,
      holdingId: "broker",
      kind: "withdraw",
      newValueCents: "8000000",
      receivedCents: "1600000",
      receivedCurrency: "PLN",
      effectiveDate: date,
    });
    expect(r.isOk()).toBe(true);
    expect(w.get("broker").buyPriceCents).toBe(4_583_333n);
    expect(w.get("broker").currentPriceCents).toBe(8_000_000n);
    const e = w.live()[0]!;
    expect(e.kind).toBe("withdraw");
    expect(e.realizedBudgetCents).toBe(683_333n);
    expect(e.flowCents).toBe(-1_600_000n);
  });

  test("added money 96k → 106k raises cost and contributions by 10k", async () => {
    const { w, adjust } = world();
    await adjust({
      ...who,
      holdingId: "broker",
      kind: "add",
      newValueCents: "10600000",
      effectiveDate: date,
    });
    expect(w.get("broker").buyPriceCents).toBe(6_500_000n);
    expect(w.get("broker").currentPriceCents).toBe(10_600_000n);
    expect(w.live()[0]).toMatchObject({
      kind: "add",
      flowCents: 1_000_000n,
      costDeltaCents: 1_000_000n,
      valueDeltaCents: 1_000_000n,
    });
  });

  test("added money that does not raise the value → nothing_added", async () => {
    const { adjust } = world();
    const r = await adjust({
      ...who,
      holdingId: "broker",
      kind: "add",
      newValueCents: "9600000",
      effectiveDate: date,
    });
    expect(r._unsafeUnwrapErr().message).toBe("nothing_added");
  });

  test("value changed moves value only, no flow", async () => {
    const { w, adjust } = world();
    await adjust({
      ...who,
      holdingId: "broker",
      kind: "value_change",
      newValueCents: "9000000",
      effectiveDate: date,
    });
    expect(w.get("broker").buyPriceCents).toBe(5_500_000n);
    expect(w.get("broker").currentPriceCents).toBe(9_000_000n);
    expect(w.live()[0]).toMatchObject({
      kind: "value_change",
      valueDeltaCents: -600_000n,
      flowCents: 0n,
    });
  });

  test("bought more BTC averages the unit price", async () => {
    const { w, adjust } = world();
    await adjust({
      ...who,
      holdingId: "btc",
      kind: "buy",
      addQuantity: "0.1",
      paidCents: "700000",
      effectiveDate: date,
    });
    expect(w.get("btc").quantity).toBe("0.5");
    expect(w.get("btc").buyPriceCents).toBe(3_400_000n);
    expect(w.live()[0]).toMatchObject({
      kind: "buy",
      qtyDelta: "0.1",
      costDeltaCents: 700_000n,
      flowCents: 700_000n,
    });
  });

  test("value change on a quantity holding → wrong_shape", async () => {
    const { adjust } = world();
    const r = await adjust({
      ...who,
      holdingId: "btc",
      kind: "value_change",
      newValueCents: "1",
      effectiveDate: date,
    });
    expect(r._unsafeUnwrapErr().message).toBe("wrong_shape");
  });
});

describe("PATCH keeps cost basis on the ledger", () => {
  function patcher() {
    const w = new MemoryWorld([
      hold({
        id: "broker",
        uiType: "broker",
        buy: 5_500_000n,
        current: 9_600_000n,
      }),
      hold({
        id: "car",
        holdingType: "possession",
        uiType: "possession",
        buy: 100n,
        current: 100n,
      }),
    ]);
    const repo = Object.assign(w.holdingRepo, {
      update: async (_t: string, _u: string, id: string) => w.get(id),
    });
    return updateHolding({ holdingRepo: repo });
  }
  const base = { tenantId: T, actorUserId: U };

  test("changing the buy price is refused", async () => {
    const r = await patcher()({
      ...base,
      holdingId: "broker",
      buyPriceCents: "1",
    });
    expect(r._unsafeUnwrapErr().message).toBe("use_adjust");
  });

  test("changing the quantity is refused", async () => {
    const r = await patcher()({ ...base, holdingId: "broker", quantity: "2" });
    expect(r._unsafeUnwrapErr().message).toBe("use_adjust");
  });

  test("re-sending the same values with a new name is fine", async () => {
    const r = await patcher()({
      ...base,
      holdingId: "broker",
      name: "Renamed",
      buyPriceCents: "5500000",
      quantity: "1.00000000",
    });
    expect(r.isOk()).toBe(true);
  });

  test("a possession's buy price can still change", async () => {
    const r = await patcher()({
      ...base,
      holdingId: "car",
      buyPriceCents: "200",
    });
    expect(r.isOk()).toBe(true);
  });
});
