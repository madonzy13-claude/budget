/**
 * create-holding-join.test.ts — Add with a name that already exists in the type
 * joins that asset (13.1 D-01, D-02, D-15, D-17). Deposits never join (D-11).
 */
import { describe, test, expect } from "bun:test";
import { createHolding } from "../../src/application/create-holding";
import { MemoryWorld, hold, T, U, rates1 } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U };
const world = (...hs: Parameters<typeof hold>[0][]) => {
  const w = new MemoryWorld(hs.map(hold));
  return {
    w,
    create: createHolding({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: rates1,
    }),
  };
};
const btc = (over: Record<string, unknown> = {}) => ({
  ...who,
  name: "BTC",
  holdingType: "crypto" as const,
  uiType: "crypto" as const,
  instrumentId: "33333333-3333-3333-3333-333333333333",
  quantity: "0.5",
  buyPriceCents: "1000000",
  buyCurrency: "PLN",
  openedOn: "2026-10-01",
  ...over,
});

describe("Create or join an asset by name", () => {
  test("adding BTC twice makes one asset with two entries", async () => {
    const { w, create } = world();
    const first = (await create(btc()))._unsafeUnwrap();
    expect(first.joined).toBe(false);
    const second = (
      await create(
        btc({
          name: " btc ",
          quantity: "1.5",
          buyPriceCents: "2000000",
          openedOn: "2026-10-02",
        }),
      )
    )._unsafeUnwrap();
    expect(second).toMatchObject({ joined: true });
    expect(second.holding.id).toBe(first.holding.id);
    expect(w.holdings.size).toBe(1);
    expect(w.get(first.holding.id).quantity).toBe("2");
    expect(
      w.live().filter((r) => r.holdingId === first.holding.id),
    ).toHaveLength(2);
  });

  test("a hidden (sold-out) asset with that name is revived", async () => {
    const { w, create } = world({
      id: "h",
      name: "BTC",
      uiType: "crypto",
      holdingType: "crypto",
      buy: 0n,
      qty: "0",
      current: null,
      inst: "33333333-3333-3333-3333-333333333333",
      archived: true,
    });
    const r = (await create(btc()))._unsafeUnwrap();
    expect(r.holding.id).toBe("h");
    expect(w.get("h").archivedAt).toBeNull();
    expect(w.get("h").quantity).toBe("0.5");
  });

  test("a different instrument under the same name is refused", async () => {
    const { create } = world({
      id: "h",
      name: "BTC",
      uiType: "crypto",
      holdingType: "crypto",
      buy: 1n,
      qty: "1",
      current: null,
      inst: "44444444-4444-4444-4444-444444444444",
    });
    expect((await create(btc()))._unsafeUnwrapErr().message).toBe(
      "instrument_mismatch",
    );
  });

  test("a second deposit with the same name is refused (one deposit per asset)", async () => {
    const { create } = world({
      id: "d",
      name: "Bank",
      uiType: "deposit",
      holdingType: "deposit",
      buy: 100n,
      current: null,
    });
    const r = await create({
      ...who,
      name: "bank",
      holdingType: "deposit",
      uiType: "deposit",
      buyPriceCents: "100",
      buyCurrency: "PLN",
      quantity: "1",
      depositRateBps: 500,
      depositStartDate: "2026-10-01",
      depositCapFrequency: "monthly",
    });
    expect(r._unsafeUnwrapErr().message).toBe("label_taken");
  });

  test("joining with a date before the asset's latest entry is refused", async () => {
    const { create } = world();
    await create(btc({ openedOn: "2026-10-05" }));
    expect(
      (await create(btc({ openedOn: "2026-10-01" })))._unsafeUnwrapErr()
        .message,
    ).toBe("before_latest_entry");
  });
});
