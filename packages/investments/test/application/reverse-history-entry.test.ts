/**
 * reverse-history-entry.test.ts — D-06 full undo (user, 261025).
 *
 * Deleting an entry reverses everything it did: the holding's quantity/cost/
 * value go back by that entry's own deltas, a conversion's destination loses
 * what it received (both legs), realized + contributions go back. Later
 * entries survive. Delete-then-re-enter must not double count.
 */
import { describe, test, expect } from "bun:test";
import { sellHolding } from "../../src/application/sell-holding";
import { adjustHolding } from "../../src/application/adjust-holding";
import { reverseHistoryEntry } from "../../src/application/reverse-history-entry";
import { MemoryWorld, hold, rates1, T, U } from "./memory-world";

const who = { tenantId: T, budgetId: T, actorUserId: U, budgetCurrency: "PLN" };
const date = "2026-10-24";

function setup(w: MemoryWorld) {
  const deps = {
    holdingRepo: w.holdingRepo,
    historyRepo: w.historyRepo,
    fxProvider: rates1,
  };
  const sell = sellHolding(deps);
  return {
    sell,
    adjust: adjustHolding({ ...deps, sellHolding: sell }),
    undo: reverseHistoryEntry({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
    }),
  };
}
const undoArgs = (entryId: string) => ({
  tenantId: T,
  budgetId: T,
  actorUserId: U,
  entryId,
});

const broker = () =>
  hold({
    id: "broker",
    uiType: "broker",
    buy: 5_500_000n,
    current: 9_600_000n,
  });
const btc = () =>
  hold({
    id: "btc",
    holdingType: "crypto",
    uiType: "crypto",
    buy: 2_500_000n,
    qty: "0.4",
    current: 6_000_000n,
  });

describe("Delete an entry = full undo (D-06)", () => {
  test("sale into existing cash: both holdings restored, both legs gone", async () => {
    const w = new MemoryWorld([
      broker(),
      hold({
        id: "cash",
        uiType: "cash",
        buy: 1_000_000n,
        current: 1_000_000n,
      }),
    ]);
    const { sell, undo } = setup(w);
    await sell({
      ...who,
      effectiveDate: date,
      holdingId: "broker",
      left: { valueCents: "3000000" },
      destination: { kind: "existing", holdingId: "cash" },
      receivedCents: "6600000",
      receivedCurrency: "PLN",
    });
    const out = w.live().find((r) => r.kind === "convert_out")!;
    const r = await undo(undoArgs(out.id));
    expect(r._unsafeUnwrap().undone).toBe(2);
    expect(w.get("broker").buyPriceCents).toBe(5_500_000n);
    expect(w.get("broker").currentPriceCents).toBe(9_600_000n);
    expect(w.get("cash").buyPriceCents).toBe(1_000_000n);
    expect(w.get("cash").currentPriceCents).toBe(1_000_000n);
    expect(w.live()).toHaveLength(0);
  });

  test("BTC sold into NEW cash: BTC back to 0.4, the created cash holding removed", async () => {
    const w = new MemoryWorld([btc()]);
    const { sell, undo } = setup(w);
    const r = await sell({
      ...who,
      effectiveDate: date,
      holdingId: "btc",
      left: { quantity: "0.3" },
      destination: {
        kind: "new",
        holding: { name: "Cash", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "600000",
      receivedCurrency: "PLN",
    });
    const newId = r._unsafeUnwrap().newHoldingId!;
    await undo(undoArgs(w.live().find((x) => x.kind === "convert_in")!.id));
    expect(w.get("btc").quantity).toBe("0.4");
    expect(w.get("btc").buyPriceCents).toBe(2_500_000n);
    expect(w.holdings.has(newId)).toBe(false);
  });

  test("undoing the first of two sales keeps the later sale", async () => {
    const w = new MemoryWorld([btc()]);
    const { sell, undo } = setup(w);
    const once = (left: string) =>
      sell({
        ...who,
        effectiveDate: date,
        holdingId: "btc",
        left: { quantity: left },
        destination: { kind: "out" },
        receivedCents: "600000",
        receivedCurrency: "PLN",
      });
    await once("0.3");
    await once("0.2");
    await undo(undoArgs(w.live()[0]!.id));
    expect(w.get("btc").quantity).toBe("0.3");
    expect(w.get("btc").buyPriceCents).toBe(2_500_000n);
    expect(w.live()).toHaveLength(1);
  });

  test("selling everything then deleting the sale un-archives the holding", async () => {
    const w = new MemoryWorld([broker()]);
    const { sell, undo } = setup(w);
    await sell({
      ...who,
      effectiveDate: date,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "9600000",
      receivedCurrency: "PLN",
    });
    expect(w.get("broker").archivedAt).not.toBeNull();
    await undo(undoArgs(w.live()[0]!.id));
    expect(w.get("broker").archivedAt).toBeNull();
    expect(w.get("broker").buyPriceCents).toBe(5_500_000n);
    expect(w.get("broker").currentPriceCents).toBe(9_600_000n);
  });

  test("delete then re-enter equals entering once (no double count)", async () => {
    const run = async (twice: boolean) => {
      const w = new MemoryWorld([broker()]);
      const { sell, undo } = setup(w);
      const s = () =>
        sell({
          ...who,
          effectiveDate: date,
          holdingId: "broker",
          left: { valueCents: "3000000" },
          destination: { kind: "out" },
          receivedCents: "6600000",
          receivedCurrency: "PLN",
        });
      await s();
      if (twice) {
        await undo(undoArgs(w.live()[0]!.id));
        await s();
      }
      const b = w.get("broker");
      return { buy: b.buyPriceCents, cur: b.currentPriceCents, ...w.totals() };
    };
    expect(await run(true)).toEqual(await run(false));
  });

  test("deposit partial sale undo restores principal and start date", async () => {
    const w = new MemoryWorld([
      hold({
        id: "dep",
        holdingType: "deposit",
        uiType: "deposit",
        buy: 1_000_000n,
        current: null,
        rateBps: 500,
        start: "2025-10-24",
        cap: "yearly",
      }),
    ]);
    const { sell, undo } = setup(w);
    await sell({
      ...who,
      effectiveDate: date,
      holdingId: "dep",
      left: { valueCents: "650000" },
      destination: { kind: "out" },
      receivedCents: "400000",
      receivedCurrency: "PLN",
    });
    expect(w.get("dep").buyPriceCents).toBe(650_000n);
    await undo(undoArgs(w.live()[0]!.id));
    expect(w.get("dep").buyPriceCents).toBe(1_000_000n);
    expect(w.get("dep").depositStartDate).toBe("2025-10-24");
  });

  test("deposit sale with a later entry → undo_later_first", async () => {
    const w = new MemoryWorld([
      hold({
        id: "dep",
        holdingType: "deposit",
        uiType: "deposit",
        buy: 1_000_000n,
        current: null,
        rateBps: 500,
        start: "2025-10-24",
        cap: "yearly",
      }),
    ]);
    const { sell, undo } = setup(w);
    const s = (keep: string, received: string) =>
      sell({
        ...who,
        effectiveDate: date,
        holdingId: "dep",
        left: { valueCents: keep },
        destination: { kind: "out" },
        receivedCents: received,
        receivedCurrency: "PLN",
      });
    await s("650000", "400000");
    await s("300000", "350000");
    const r = await undo(undoArgs(w.live()[0]!.id));
    expect(r._unsafeUnwrapErr().message).toBe("undo_later_first");
  });

  test("deleting the only Start of a quantity holding would empty it", async () => {
    const w = new MemoryWorld([btc()]);
    await w.historyRepo.commit(T, U, {
      budgetId: T,
      patches: [],
      entries: [
        {
          holdingRef: "btc",
          kind: "start",
          effectiveDate: "2024-01-10",
          amountCents: 1_000_000n,
          amountCurrency: "PLN",
          qtyDelta: "0.4",
          costDeltaCents: 1_000_000n,
          costCurrency: "PLN",
          valueDeltaCents: 0n,
          flowCents: 1_000_000n,
          flowCurrency: "PLN",
          soldCostBudgetCents: null,
          realizedBudgetCents: null,
          budgetCurrency: null,
          priorPrincipalCents: null,
          priorStartDate: null,
          transfer: false,
        },
      ],
    });
    const { undo } = setup(w);
    const r = await undo(undoArgs(w.live()[0]!.id));
    expect(r._unsafeUnwrapErr().message).toBe("would_empty_holding");
  });

  test("deleting an Added-money entry reverses cost, value and flow", async () => {
    const w = new MemoryWorld([broker()]);
    const { adjust, undo } = setup(w);
    await adjust({
      ...who,
      holdingId: "broker",
      kind: "add",
      newValueCents: "10600000",
      effectiveDate: date,
    });
    await undo(undoArgs(w.live()[0]!.id));
    expect(w.get("broker").buyPriceCents).toBe(5_500_000n);
    expect(w.get("broker").currentPriceCents).toBe(9_600_000n);
    expect(w.totals().flow).toBe(0n);
  });

  test("an unknown entry → not_found", async () => {
    const w = new MemoryWorld([broker()]);
    const r = await setup(w).undo(undoArgs("missing"));
    expect(r._unsafeUnwrapErr().message).toBe("not_found");
  });
});
