/**
 * create-holding-join.test.ts — Add always creates: names are not unique
 * (round-5 scope change overturns D-02's join). Deposit start-dated entry (R5-1).
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

// Round-5 scope change (user, 2026-10-29): assets are never unique. Adding
// always creates; joining an existing asset is Swap → Buy by id.
describe("Create an asset (names are not unique)", () => {
  test("adding BTC twice makes two assets, each with its own entry", async () => {
    const { w, create } = world();
    const first = (await create(btc()))._unsafeUnwrap();
    const second = (
      await create(
        btc({ name: " btc ", quantity: "1.5", openedOn: "2026-10-02" }),
      )
    )._unsafeUnwrap();
    expect(second.holding.id).not.toBe(first.holding.id);
    expect(w.holdings.size).toBe(2);
    expect(w.get(first.holding.id).quantity).toBe("0.5");
    for (const id of [first.holding.id, second.holding.id])
      expect(w.live().filter((r) => r.holdingId === id)).toHaveLength(1);
  });

  test("a hidden asset with that name stays hidden; a new one is created", async () => {
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
    expect(r.holding.id).not.toBe("h");
    expect(w.get("h").archivedAt).not.toBeNull();
    expect(w.get("h").quantity).toBe("0");
  });

  test("a different instrument under the same name is its own asset", async () => {
    const { w, create } = world({
      id: "h",
      name: "BTC",
      uiType: "crypto",
      holdingType: "crypto",
      buy: 1n,
      qty: "1",
      current: null,
      inst: "44444444-4444-4444-4444-444444444444",
    });
    const r = (await create(btc()))._unsafeUnwrap();
    expect(r.holding.id).not.toBe("h");
    expect(w.holdings.size).toBe(2);
  });

  test("a second deposit with the same name is created", async () => {
    const { w, create } = world({
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
    expect(r._unsafeUnwrap().holding.id).not.toBe("d");
    expect(w.holdings.size).toBe(2);
  });

  test("the same name AND currency twice makes two assets", async () => {
    const { w, create } = world();
    const pot = {
      ...who,
      name: "Erste",
      holdingType: "cash_fx" as const,
      uiType: "cash" as const,
      quantity: "1",
      buyPriceCents: "100000",
      buyCurrency: "PLN",
      currentPriceCurrency: "PLN",
      openedOn: "2026-10-01",
    };
    const a = (await create(pot))._unsafeUnwrap();
    const b = (await create(pot))._unsafeUnwrap();
    expect(b.holding.id).not.toBe(a.holding.id);
    expect(b).not.toHaveProperty("joined");
    expect(w.holdings.size).toBe(2);
  });
});

// Round-5 gap 1 (user): a deposit's "Added money" sits on its start date.
describe("Create deposit", () => {
  const deposit = (start: string) => ({
    ...who,
    name: "Savings",
    holdingType: "deposit" as const,
    uiType: "deposit" as const,
    buyPriceCents: "100000",
    buyCurrency: "PLN",
    quantity: "1",
    depositRateBps: 500,
    depositStartDate: start,
    depositCapFrequency: "monthly" as const,
    openedOn: "2026-10-29",
  });
  const today = () => new Date().toISOString().slice(0, 10);

  test("dates the opening entry on the start date", async () => {
    const { w, create } = world();
    const r = (await create(deposit("2026-03-01")))._unsafeUnwrap();
    const own = w.live().filter((x) => x.holdingId === r.holding.id);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ kind: "add", effectiveDate: "2026-03-01" });
  });

  test("a future start date dates the opening entry today", async () => {
    const { w, create } = world();
    const r = (await create(deposit("2999-01-01")))._unsafeUnwrap();
    const own = w.live().filter((x) => x.holdingId === r.holding.id);
    expect(own[0]?.effectiveDate).toBe(today());
  });

  test("a non-deposit still uses its own date", async () => {
    const { w, create } = world();
    const r = (await create(btc({ openedOn: "2026-05-05" })))._unsafeUnwrap();
    const own = w.live().filter((x) => x.holdingId === r.holding.id);
    expect(own[0]?.effectiveDate).toBe("2026-05-05");
  });
});
