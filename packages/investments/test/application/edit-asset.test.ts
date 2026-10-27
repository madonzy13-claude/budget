/**
 * edit-asset.test.ts — slim Edit (13.1 D-06, D-07, D-18, D-36): label,
 * display currency, hand value / price. Never quantity or cost (CR-01).
 */
import { describe, test, expect } from "bun:test";
import { editAsset } from "../../src/application/edit-asset";
import { MemoryWorld, hold, T, U } from "./memory-world";

const who = {
  tenantId: T,
  budgetId: T,
  actorUserId: U,
  budgetCurrency: "PLN",
  today: "2026-10-27",
};
function world(hs: Parameters<typeof hold>[0][], rate = "1") {
  const w = new MemoryWorld(hs.map(hold));
  const fx = {
    rateAsOf: async () => ({ rate, provider: "stub", isStale: false }),
  } as never;
  return {
    w,
    edit: editAsset({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: fx,
    }),
  };
}
const cash = {
  id: "c",
  name: "Pot",
  uiType: "cash",
  holdingType: "cash_fx",
  buy: 100_000n,
  current: 100_000n,
};

describe("Edit an asset", () => {
  test("a label-only edit renames and books nothing", async () => {
    const { w, edit } = world([cash]);
    await edit({ ...who, holdingId: "c", name: "Savings pot" });
    const plan = w.plans[0]!;
    expect(plan.renameHolding).toEqual({ id: "c", name: "Savings pot" });
    expect(plan.entries).toEqual([]);
    expect(
      plan.patches.some(
        (p) => p.quantity !== undefined || p.buyPriceCents !== undefined,
      ),
    ).toBe(false);
    expect(w.get("c").name).toBe("Savings pot");
  });

  test("a new value books a Value updated entry dated today with the prior value", async () => {
    const { w, edit } = world([cash]);
    await edit({ ...who, holdingId: "c", currentValueCents: "130000" });
    expect(String(w.get("c").currentPriceCents)).toBe("130000");
    expect(w.live()[0]).toMatchObject({
      kind: "value_change",
      effectiveDate: "2026-10-27",
      valueDeltaCents: 30_000n,
      priorPriceCents: "100000",
      priorPriceCurrency: "PLN",
    });
    expect(w.get("c").buyPriceCents).toBe(100_000n);
  });

  test("a hand-priced quantity asset books a Price updated entry", async () => {
    const { w, edit } = world([
      {
        id: "g",
        uiType: "collectibles",
        holdingType: "other",
        buy: 1_000n,
        qty: "3",
        current: 2_000n,
      },
    ]);
    await edit({ ...who, holdingId: "g", currentPriceCents: "2500" });
    expect(w.live()[0]).toMatchObject({
      kind: "price_change",
      valueDeltaCents: 1_500n,
      priorPriceCents: "2000",
    });
  });

  test("display currency on a hand-valued asset converts the value at today's rate; cost untouched", async () => {
    const { w, edit } = world([cash], "0.25");
    await edit({ ...who, holdingId: "c", displayCurrency: "EUR" });
    expect(String(w.get("c").currentPriceCents)).toBe("25000");
    expect(w.get("c").currentPriceCurrency).toBe("EUR");
    expect(w.get("c").buyPriceCents).toBe(100_000n);
    expect(w.get("c").buyCurrency).toBe("PLN");
    expect(w.live()).toHaveLength(0);
  });

  test("display currency on a market-priced asset only changes the currency", async () => {
    const { w, edit } = world(
      [
        {
          id: "m",
          uiType: "crypto",
          holdingType: "crypto",
          buy: 1n,
          qty: "2",
          current: 6_000n,
          inst: "33333333-3333-3333-3333-333333333333",
        },
      ],
      "0.25",
    );
    await edit({ ...who, holdingId: "m", displayCurrency: "EUR" });
    expect(w.plans[0]!.patches).toEqual([
      { id: "m", currentPriceCurrency: "EUR" },
    ]);
    expect(w.live()).toHaveLength(0);
  });

  test("a label taken in the type is refused", async () => {
    const { edit } = world([cash, { ...cash, id: "c2", name: "Other" }]);
    expect(
      (
        await edit({ ...who, holdingId: "c2", name: " pot " })
      )._unsafeUnwrapErr().message,
    ).toBe("label_taken");
  });
});
