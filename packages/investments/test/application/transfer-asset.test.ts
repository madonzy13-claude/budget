/**
 * transfer-asset.test.ts — Swap → Transfer (13.1 D-10): move quantity / value
 * between assets of the same type (crypto + stocks: same instrument) or into a
 * new label. Not a sale: cost moves proportionally, flow 0, no realized.
 */
import { describe, test, expect } from "bun:test";
import { transferAsset } from "../../src/application/transfer-asset";
import { MemoryWorld, hold, T, U, rates1 } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
const I1 = "11111111-aaaa-4aaa-8aaa-111111111111";
const I2 = "22222222-aaaa-4aaa-8aaa-222222222222";
const btc = (over: Record<string, unknown> = {}) => ({
  id: "btc",
  name: "BTC",
  holdingType: "crypto",
  uiType: "crypto",
  buy: 2_500n,
  qty: "4",
  current: 3_000n,
  inst: I1,
  ...over,
});
function world(...hs: Parameters<typeof hold>[0][]) {
  const w = new MemoryWorld(hs.map(hold));
  return {
    w,
    move: transferAsset({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: rates1,
    }),
  };
}
const base = { ...who, holdingId: "btc", effectiveDate: "2026-10-01" };

describe("Transfer between assets", () => {
  test("1 of 4 BTC moves a quarter of the cost; flow 0, no realized, one transfer id", async () => {
    const { w, move } = world(
      btc(),
      btc({ id: "bin", name: "BTC Binance", buy: 1_000n, qty: "1" }),
    );
    const r = await move({
      ...base,
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: "bin" },
    });
    expect(r.isOk()).toBe(true);
    expect(w.get("btc").quantity).toBe("3");
    expect(w.get("btc").buyPriceCents).toBe(2_500n);
    expect(w.get("bin").quantity).toBe("2");
    expect(w.get("bin").buyPriceCents).toBe(1_750n);
    const legs = w.live();
    expect(
      legs.map((l) => [
        l.kind,
        l.holdingId,
        l.costDeltaCents,
        l.flowCents,
        l.realizedBudgetCents,
      ]),
    ).toEqual([
      ["transfer_out", "btc", -2_500n, 0n, null],
      ["transfer_in", "bin", 2_500n, 0n, null],
    ]);
    expect(legs[0]!.transferId).not.toBeNull();
    expect(legs[0]!.transferId).toBe(legs[1]!.transferId);
  });

  test("moving everything hides the source and revives a hidden destination", async () => {
    const { w, move } = world(
      btc(),
      btc({
        id: "bin",
        name: "BTC Binance",
        buy: 0n,
        qty: "0",
        archived: true,
      }),
    );
    await move({
      ...base,
      move: { quantity: "4" },
      to: { kind: "existing", holdingId: "bin" },
    });
    expect(w.get("btc").archivedAt).not.toBeNull();
    expect(w.get("bin").archivedAt).toBeNull();
    expect(w.get("bin").quantity).toBe("4");
  });

  test("to a new label creates the asset with the moved quantity and cost", async () => {
    const { w, move } = world(btc());
    const r = await move({
      ...base,
      move: { quantity: "1" },
      to: { kind: "new", name: "BTC Cold" },
    });
    expect(r._unsafeUnwrap().newHoldingId).not.toBeNull();
    expect(w.plans[0]!.newHolding).toMatchObject({
      name: "BTC Cold",
      uiType: "crypto",
      instrumentId: I1,
      quantity: "1",
      buyPriceCents: 2_500n,
    });
  });

  test("a new label that already exists is refused", async () => {
    const { move } = world(btc(), btc({ id: "c", name: "BTC Cold" }));
    const r = await move({
      ...base,
      move: { quantity: "1" },
      to: { kind: "new", name: " btc cold " },
    });
    expect(r._unsafeUnwrapErr().message).toBe("label_taken");
  });

  test("crypto needs the same instrument; metals do not", async () => {
    const { move } = world(btc(), btc({ id: "x", name: "Other", inst: I2 }));
    expect(
      (
        await move({
          ...base,
          move: { quantity: "1" },
          to: { kind: "existing", holdingId: "x" },
        })
      )._unsafeUnwrapErr().message,
    ).toBe("transfer_instrument_mismatch");
    const metals = world(
      {
        id: "g1",
        name: "Gold A",
        holdingType: "commodity",
        uiType: "precious_metals",
        buy: 100n,
        qty: "2",
        current: 100n,
        inst: I1,
      },
      {
        id: "g2",
        name: "Gold B",
        holdingType: "commodity",
        uiType: "precious_metals",
        buy: 100n,
        qty: "2",
        current: 100n,
        inst: I2,
      },
    );
    const ok = await metals.move({
      ...base,
      holdingId: "g1",
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: "g2" },
    });
    expect(ok.isOk()).toBe(true);
  });

  test("other types, itself, deposits and over-moves are refused", async () => {
    const { move } = world(
      btc(),
      {
        id: "c",
        name: "Cash",
        holdingType: "cash_fx",
        uiType: "cash",
        buy: 1n,
        current: 1n,
      },
      {
        id: "d",
        name: "Bank",
        holdingType: "deposit",
        uiType: "deposit",
        buy: 1n,
        current: null,
      },
    );
    const code = async (x: Parameters<typeof move>[0]) =>
      (await move(x))._unsafeUnwrapErr().message;
    expect(
      await code({
        ...base,
        move: { quantity: "1" },
        to: { kind: "existing", holdingId: "c" },
      }),
    ).toBe("transfer_type_mismatch");
    expect(
      await code({
        ...base,
        move: { quantity: "1" },
        to: { kind: "existing", holdingId: "btc" },
      }),
    ).toBe("transfer_same_asset");
    expect(
      await code({
        ...base,
        holdingId: "d",
        move: { valueCents: "1" },
        to: { kind: "new", name: "B2" },
      }),
    ).toBe("deposit_not_allowed");
    expect(
      await code({
        ...base,
        move: { quantity: "5" },
        to: { kind: "new", name: "B2" },
      }),
    ).toBe("move_qty_out_of_range");
  });

  test("an amount asset moves value and cost proportionally", async () => {
    const { w, move } = world(
      {
        id: "b1",
        name: "IKE",
        holdingType: "other",
        uiType: "broker",
        buy: 1_600_000n,
        current: 2_000_000n,
      },
      {
        id: "b2",
        name: "IKZE",
        holdingType: "other",
        uiType: "broker",
        buy: 0n,
        current: 0n,
      },
    );
    await move({
      ...base,
      holdingId: "b1",
      move: { valueCents: "500000" },
      to: { kind: "existing", holdingId: "b2" },
    });
    expect(w.get("b1").buyPriceCents).toBe(1_200_000n);
    expect(String(w.get("b1").currentPriceCents)).toBe("1500000");
    expect(w.get("b2").buyPriceCents).toBe(400_000n);
    expect(String(w.get("b2").currentPriceCents)).toBe("500000");
    expect(w.live()[0]).toMatchObject({
      kind: "transfer_out",
      costDeltaCents: -400_000n,
      valueDeltaCents: -500_000n,
      flowCents: 0n,
    });
  });
});
