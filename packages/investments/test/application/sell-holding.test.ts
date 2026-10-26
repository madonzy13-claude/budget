/**
 * sell-holding.test.ts — Phase 13 Sell booking against in-memory fakes.
 * The fake HistoryRepo records the BookingPlan; the stub FxProvider records
 * which (from, to, date) it was asked for. Fixtures are 13-CONTEXT's.
 */
import { describe, test, expect } from "bun:test";
import { Holding } from "../../src/domain/holding";
import { sellHolding } from "../../src/application/sell-holding";
import { createHolding } from "../../src/application/create-holding";
import type { HoldingRepo } from "../../src/ports/holding-repo";
import type { BookingPlan, HistoryRepo } from "../../src/ports/history-repo";

const T = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-2222-2222-222222222222";

interface H {
  id: string;
  name?: string;
  holdingType?: string;
  uiType: string;
  buy: bigint | null;
  buyCcy?: string;
  qty?: string;
  current: bigint | null;
  curCcy?: string;
  rateBps?: number;
  start?: string;
  cap?: string;
}

function hold(h: H): Holding {
  return new Holding(
    h.id,
    T,
    h.name ?? h.id,
    (h.holdingType ?? "other") as never,
    null,
    h.buy,
    h.buyCcy ?? "PLN",
    h.qty ?? "1",
    h.current,
    h.curCcy ?? h.buyCcy ?? "PLN",
    0,
    null,
    new Date("2024-01-10T00:00:00Z"),
    h.uiType,
    null,
    null,
    null,
    null,
    null,
    null,
    h.curCcy ?? h.buyCcy ?? "PLN",
    null,
    null,
    null,
    h.rateBps ?? null,
    h.start ?? null,
    h.cap ?? null,
    null,
  );
}

function fakes(holdings: Holding[], rates: Record<string, string> = {}) {
  const plans: BookingPlan[] = [];
  const fxCalls: string[] = [];
  const holdingRepo = {
    listForBudget: async () => holdings,
    findById: async (_t: string, _u: string, id: string) =>
      holdings.find((h) => h.id === id) ?? null,
  } as unknown as HoldingRepo;
  const historyRepo = {
    commit: async (_t: string, _u: string, plan: BookingPlan) => {
      plans.push(plan);
      return {
        newHoldingId: plan.newHolding ? "new-id" : null,
        transferId: plan.entries.some((e) => e.transfer) ? "tx-id" : null,
      };
    },
    listFlows: async () => [],
  } as unknown as HistoryRepo;
  const fxProvider = {
    rateAsOf: async (from: string, to: string, date: Date | string) => {
      const d =
        typeof date === "string" ? date : date.toISOString().slice(0, 10);
      fxCalls.push(`${from}>${to}@${d}`);
      const r = rates[`${from}@${d}`];
      if (!r)
        throw Object.assign(new Error("no rate"), {
          name: "NoFxRateAvailable",
        });
      return { rate: r, provider: "stub", isStale: false };
    },
  } as never;
  const sell = sellHolding({ holdingRepo, historyRepo, fxProvider });
  return { sell, plans, fxCalls };
}

const base = {
  tenantId: T,
  budgetId: T,
  actorUserId: U,
  budgetCurrency: "PLN",
  effectiveDate: "2026-10-25",
};

const broker = () =>
  hold({
    id: "broker",
    uiType: "broker",
    buy: 5_500_000n,
    current: 9_600_000n,
  });

describe("Sell an amount holding", () => {
  test("broker keep 30k, out, received 66k → withdraw books realized 28,187.50", async () => {
    const { sell, plans } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "3000000" },
      destination: { kind: "out" },
      receivedCents: "6600000",
      receivedCurrency: "PLN",
    });
    expect(r.isOk()).toBe(true);
    const plan = plans[0]!;
    expect(plan.patches).toEqual([
      {
        id: "broker",
        buyPriceCents: 1_718_750n,
        currentPriceCents: 3_000_000n,
      },
    ]);
    expect(plan.entries).toHaveLength(1);
    const e = plan.entries[0]!;
    expect(e.kind).toBe("withdraw");
    expect(e.costDeltaCents).toBe(-3_781_250n);
    expect(e.valueDeltaCents).toBe(-6_600_000n);
    expect(e.flowCents).toBe(-6_600_000n);
    expect(e.flowCurrency).toBe("PLN");
    expect(e.realizedBudgetCents).toBe(2_818_750n);
    expect(e.soldCostBudgetCents).toBe(3_781_250n);
    expect(e.amountCents).toBe(6_600_000n);
    expect(e.transfer).toBe(false);
  });

  test("into existing cash: convert_out + merge + convert_in, flow 0 both legs", async () => {
    const cash = hold({
      id: "cash",
      uiType: "cash",
      buy: 1_000_000n,
      current: 1_000_000n,
    });
    const { sell, plans } = fakes([broker(), cash]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "3000000" },
      destination: { kind: "existing", holdingId: "cash" },
      receivedCents: "6600000",
      receivedCurrency: "PLN",
    });
    expect(r.isOk()).toBe(true);
    const plan = plans[0]!;
    expect(plan.patches[1]).toEqual({
      id: "cash",
      buyPriceCents: 7_600_000n,
      currentPriceCents: 7_600_000n,
    });
    const [out, inn] = plan.entries;
    expect(out!.kind).toBe("convert_out");
    expect(out!.flowCents).toBe(0n);
    expect(out!.realizedBudgetCents).toBe(2_818_750n);
    expect(inn!.kind).toBe("convert_in");
    expect(inn!.holdingRef).toBe("cash");
    expect(inn!.costDeltaCents).toBe(6_600_000n);
    expect(inn!.valueDeltaCents).toBe(6_600_000n);
    expect(inn!.flowCents).toBe(0n);
    expect(out!.transfer && inn!.transfer).toBe(true);
  });

  test("keep 0 archives the holding", async () => {
    const { sell, plans } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "9600000",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrap().archived).toBe(true);
    expect(plans[0]!.patches[0]!.archive).toBe(true);
  });
});

describe("Sell a quantity holding", () => {
  test("BTC 0.4 → 0.3 into new cash: realized 3,500, new holding at 6,000", async () => {
    const btc = hold({
      id: "btc",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 2_500_000n,
      qty: "0.4",
      current: 6_000_000n,
    });
    const { sell, plans } = fakes([btc]);
    const r = await sell({
      ...base,
      holdingId: "btc",
      left: { quantity: "0.3" },
      destination: {
        kind: "new",
        holding: { name: "Cash", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "600000",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrap().newHoldingId).toBe("new-id");
    const plan = plans[0]!;
    expect(plan.patches).toEqual([{ id: "btc", quantity: "0.3" }]);
    const [out, inn] = plan.entries;
    expect(out!.realizedBudgetCents).toBe(350_000n);
    expect(out!.qtyDelta).toBe("-0.1");
    expect(out!.costDeltaCents).toBe(-250_000n);
    expect(out!.valueDeltaCents).toBe(0n);
    expect(plan.newHolding).toMatchObject({
      uiType: "cash",
      buyPriceCents: 600_000n,
      currentPriceCents: 600_000n,
      quantity: "1",
      buyCurrency: "PLN",
      currentPriceCurrency: "PLN",
    });
    expect(inn!.holdingRef).toBe("$new");
    expect(inn!.valueDeltaCents).toBe(600_000n);
  });
});

describe("Sell part of a deposit (D-20)", () => {
  test("keep 6,500 of 10,500: principal 6,500 restarts today, realized 500", async () => {
    // 10,000 at 5% from 2025-10-25, yearly cap → 10,500 on 2026-10-25
    const dep = hold({
      id: "dep",
      holdingType: "deposit",
      uiType: "deposit",
      buy: 1_000_000n,
      current: null,
      rateBps: 500,
      start: "2025-10-25",
      cap: "yearly",
    });
    const { sell, plans } = fakes([dep]);
    const r = await sell({
      ...base,
      holdingId: "dep",
      left: { valueCents: "650000" },
      destination: { kind: "out" },
      receivedCents: "400000",
      receivedCurrency: "PLN",
    });
    expect(r.isOk()).toBe(true);
    const plan = plans[0]!;
    expect(plan.patches).toEqual([
      { id: "dep", buyPriceCents: 650_000n, depositStartDate: "2026-10-25" },
    ]);
    const e = plan.entries[0]!;
    expect(e.realizedBudgetCents).toBe(50_000n);
    expect(e.soldCostBudgetCents).toBe(350_000n);
    expect(e.costDeltaCents).toBe(-350_000n);
    expect(e.priorPrincipalCents).toBe(1_000_000n);
    expect(e.priorStartDate).toBe("2025-10-25");
    expect(e.flowCents).toBe(-400_000n);
  });
});

describe("FX and validation", () => {
  test("realized frozen at the sale date's rates (D-18)", async () => {
    const eur = hold({
      id: "eur",
      uiType: "broker",
      buy: 100_000n,
      buyCcy: "EUR",
      current: 110_000n,
    });
    const { sell, plans, fxCalls } = fakes([eur], {
      "EUR@2025-03-01": "4.30",
      "EUR@2026-10-26": "4.60",
    });
    await sell({
      ...base,
      effectiveDate: "2025-03-01",
      holdingId: "eur",
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "110000",
      receivedCurrency: "EUR",
    });
    expect(plans[0]!.entries[0]!.realizedBudgetCents).toBe(43_000n);
    expect(fxCalls.every((c) => c.endsWith("@2025-03-01"))).toBe(true);
  });

  test("a missing rate is fx_unavailable with currency and date", async () => {
    const eur = hold({
      id: "eur",
      uiType: "broker",
      buy: 100n,
      buyCcy: "EUR",
      current: 110n,
    });
    const { sell } = fakes([eur]);
    const r = await sell({
      ...base,
      holdingId: "eur",
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "110",
      receivedCurrency: "EUR",
    });
    const e = r._unsafeUnwrapErr() as Error & {
      currency?: string;
      date?: string;
    };
    expect(e.message).toBe("fx_unavailable");
    expect(e.currency).toBe("EUR");
    expect(e.date).toBe("2026-10-25");
  });

  test("existing destination in another currency → currency_mismatch", async () => {
    const usd = hold({
      id: "usd",
      uiType: "cash",
      buy: 100n,
      buyCcy: "USD",
      current: 100n,
    });
    const { sell } = fakes([broker(), usd]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "usd" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrapErr().message).toBe("currency_mismatch");
  });

  test("selling into itself → same_holding", async () => {
    const { sell } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "broker" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrapErr().message).toBe("same_holding");
  });

  test("destination not in this budget's live holdings → not_found", async () => {
    const { sell } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "elsewhere" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrapErr().message).toBe("not_found");
  });

  test("keep ≥ value → keep_out_of_range", async () => {
    const { sell } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "9600000" },
      destination: { kind: "out" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrapErr().message).toBe("keep_out_of_range");
  });
});

describe("Create writes the first history entry", () => {
  function createFakes() {
    const plans: BookingPlan[] = [];
    let created = 0;
    const holdingRepo = {
      create: async () => {
        created++;
        return hold({
          id: "plain",
          uiType: "possession",
          buy: null,
          current: 1n,
        });
      },
      findById: async () =>
        hold({ id: "new-id", uiType: "broker", buy: 1n, current: 1n }),
    } as unknown as HoldingRepo;
    const historyRepo = {
      commit: async (_t: string, _u: string, plan: BookingPlan) => {
        plans.push(plan);
        return { newHoldingId: "new-id", transferId: null };
      },
      listFlows: async () => [],
    } as unknown as HistoryRepo;
    return {
      create: createHolding({ holdingRepo, historyRepo }),
      plans,
      created: () => created,
    };
  }
  const who = { tenantId: T, budgetId: T, actorUserId: U };

  test("broker opened 2023-05-01 → add entry with flow = cost", async () => {
    const f = createFakes();
    const r = await f.create({
      ...who,
      name: "Broker",
      holdingType: "other",
      uiType: "broker",
      quantity: "1",
      buyPriceCents: "5500000",
      buyCurrency: "PLN",
      currentPriceCents: "9600000",
      currentPriceCurrency: "PLN",
      openedOn: "2023-05-01",
    });
    expect(r._unsafeUnwrap().id).toBe("new-id");
    const e = f.plans[0]!.entries[0]!;
    expect(e).toMatchObject({
      holdingRef: "$new",
      kind: "add",
      effectiveDate: "2023-05-01",
      flowCents: 5_500_000n,
      flowCurrency: "PLN",
      costDeltaCents: 5_500_000n,
      valueDeltaCents: 9_600_000n,
    });
  });

  test("crypto → buy entry with qty and flow = buy × qty", async () => {
    const f = createFakes();
    await f.create({
      ...who,
      name: "BTC",
      holdingType: "crypto",
      uiType: "crypto",
      quantity: "0.4",
      buyPriceCents: "2500000",
      buyCurrency: "PLN",
    });
    const e = f.plans[0]!.entries[0]!;
    expect(e.kind).toBe("buy");
    expect(e.qtyDelta).toBe("0.4");
    expect(e.flowCents).toBe(1_000_000n);
    expect(e.valueDeltaCents).toBe(0n);
  });

  test("possession or no buy price → no entry", async () => {
    const f = createFakes();
    await f.create({
      ...who,
      name: "Car",
      holdingType: "possession",
      uiType: "possession",
      quantity: "1",
      currentPriceCents: "100",
    });
    expect(f.plans).toHaveLength(0);
    expect(f.created()).toBe(1);
  });

  test("no openedOn → dated today (UTC)", async () => {
    const f = createFakes();
    await f.create({
      ...who,
      name: "Broker",
      holdingType: "other",
      uiType: "broker",
      quantity: "1",
      buyPriceCents: "100",
      buyCurrency: "PLN",
    });
    expect(f.plans[0]!.entries[0]!.effectiveDate).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });
});
