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

  // Round 4 (user, 2026-10-29): a sold-out asset stays listed; archiving is
  // an explicit action now.
  test("keep 0 leaves the holding listed (no auto-archive)", async () => {
    const { sell, plans } = fakes([broker()]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "9600000",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrap().archived).toBe(false);
    expect(plans[0]!.patches[0]!.archive).toBeFalsy();
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

  // Round-5 gap 6 (user): any transaction in any currency on any asset.
  test("existing amount destination in another currency: converted at one deal rate", async () => {
    const konto = hold({
      id: "konto",
      uiType: "cash",
      buy: 100_000n,
      current: 100_000n,
    });
    const { sell, plans } = fakes([broker(), konto], {
      "EUR@2026-10-25": "4.25",
      "PLN@2026-10-25": "0.2353",
    });
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "konto" },
      receivedCents: "40000",
      receivedCurrency: "EUR",
    });
    expect(r.isOk()).toBe(true);
    const plan = plans[0]!;
    expect(plan.newHolding).toBeUndefined();
    expect(plan.patches[1]).toEqual({
      id: "konto",
      buyPriceCents: 270_000n,
      currentPriceCents: 270_000n,
    });
    const [out, inn] = plan.entries;
    expect(out).toMatchObject({ amountCents: 40_000n, amountCurrency: "EUR" });
    expect(inn).toMatchObject({
      kind: "convert_in",
      holdingRef: "konto",
      amountCents: 40_000n,
      amountCurrency: "EUR",
      costDeltaCents: 170_000n,
      costCurrency: "PLN",
      valueDeltaCents: 170_000n,
    });
  });

  test("existing quantity destination in another currency: priced in its own, received at the deal rate", async () => {
    const eth = hold({
      id: "eth",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 150_000n,
      buyCcy: "USD",
      qty: "1",
      current: 200_000n,
    });
    const { sell, plans } = fakes([broker(), eth], {
      "EUR@2026-10-25": "1.1",
      "PLN@2026-10-25": "0.2353",
    });
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "eth", quantityBought: "2" },
      receivedCurrency: "EUR",
    });
    expect(r.isOk()).toBe(true);
    const [out, inn] = plans[0]!.entries;
    expect(out).toMatchObject({ amountCents: 363_636n, amountCurrency: "EUR" });
    expect(inn).toMatchObject({
      holdingRef: "eth",
      qtyDelta: "2",
      amountCents: 363_636n,
      amountCurrency: "EUR",
      costDeltaCents: 400_000n,
      costCurrency: "USD",
    });
  });

  test("no deal rate for the destination currency → fx_unavailable, nothing written", async () => {
    const usd = hold({
      id: "usd",
      uiType: "cash",
      buy: 100n,
      buyCcy: "USD",
      current: 100n,
    });
    const { sell, plans } = fakes([broker(), usd]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: "usd" },
      receivedCents: "100",
      receivedCurrency: "PLN",
    });
    expect(r._unsafeUnwrapErr().message).toBe("fx_unavailable");
    expect(plans).toHaveLength(0);
  });

  // Round-5 scope change: a new destination never joins by name.
  test("a new destination named like an existing asset is a new asset", async () => {
    const konto = hold({
      id: "konto",
      name: "Konto",
      uiType: "cash",
      holdingType: "cash_fx",
      buy: 100_000n,
      current: 100_000n,
    });
    const { sell, plans } = fakes([broker(), konto]);
    const r = await sell({
      ...base,
      holdingId: "broker",
      left: { valueCents: "0" },
      destination: {
        kind: "new",
        holding: { name: "Konto", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "5000",
      receivedCurrency: "PLN",
    } as never);
    expect(r.isOk()).toBe(true);
    expect(plans[0]!.newHolding?.name).toBe("Konto");
    expect(plans[0]!.patches.map((p) => p.id)).toEqual(["broker"]);
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
      create: createHolding({
        holdingRepo,
        historyRepo,
        fxProvider: {} as never,
      }),
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
    expect(r._unsafeUnwrap().holding.id).toBe("new-id");
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

// ── 13.1: assets + sell to wallet (D-09, D-15, D-17, D-20..D-25) ────────────
import { MemoryWorld, hold as memHold, rates1 } from "./memory-world";

describe("Sell an asset (13.1)", () => {
  const who13 = {
    tenantId: T,
    budgetId: T,
    actorUserId: U,
    budgetCurrency: "PLN",
  };
  const btc4 = () =>
    memHold({
      id: "btc",
      name: "BTC",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 2_500n,
      qty: "4",
      current: 3_000n,
    });
  const setup = (...extra: Parameters<typeof memHold>[0][]) => {
    const w = new MemoryWorld([btc4(), ...extra.map(memHold)]);
    return {
      w,
      sell: sellHolding({
        holdingRepo: w.holdingRepo,
        historyRepo: w.historyRepo,
        fxProvider: rates1,
      }),
    };
  };
  const base = {
    ...who13,
    holdingId: "btc",
    effectiveDate: "2026-10-01",
    left: { quantity: "3" },
    receivedCents: "3000",
    receivedCurrency: "PLN",
  };

  test("selling 1 of 4 moves cost proportionally and leaves investments (flow = −received)", async () => {
    const { w, sell } = setup();
    expect(
      (
        await sell({
          ...base,
          destination: { kind: "out", wallet: { kind: "nowhere" } },
        })
      ).isOk(),
    ).toBe(true);
    expect(w.live()[0]).toMatchObject({
      kind: "withdraw",
      costDeltaCents: -2_500n,
      realizedBudgetCents: 500n,
      flowCents: -3_000n,
    });
    expect(w.plans[0]!.walletCredit).toBeUndefined();
  });

  test("Out into an existing wallet credits it by the received amount in major units", async () => {
    const { w, sell } = setup();
    w.wallets.set("wal", {
      id: "wal",
      name: "Bank",
      walletType: "SPENDINGS",
      currency: "PLN",
      balance: "10",
    });
    await sell({
      ...base,
      destination: {
        kind: "out",
        wallet: { kind: "existing", walletId: "wal" },
      },
    });
    expect(w.plans[0]!.walletCredit).toEqual({
      target: { walletId: "wal" },
      amountMajor: "30.00",
      currency: "PLN",
    });
    expect(w.wallets.get("wal")!.balance).toBe("40.0000");
    expect(w.live()[0]).toMatchObject({
      walletId: "wal",
      walletDeltaNumeric: "30.00",
      walletCreated: false,
    });
  });

  test("Out into a new wallet creates it with the amount", async () => {
    const { w, sell } = setup();
    const r = await sell({
      ...base,
      destination: {
        kind: "out",
        wallet: {
          kind: "new",
          name: "From BTC",
          walletType: "CUSHION",
          currency: "PLN",
        },
      },
    });
    expect(r._unsafeUnwrap()).toMatchObject({ walletType: "CUSHION" });
    expect(w.plans[0]!.walletCredit!.target).toEqual({
      create: { name: "From BTC", walletType: "CUSHION", currency: "PLN" },
    });
    expect(w.live()[0]).toMatchObject({ walletCreated: true });
    expect(w.live()[0]!.walletId).not.toBeNull();
  });

  // Round-5 scope change: reviving is by id only — a new name always creates.
  test("a new destination named like a hidden asset creates a new one; the hidden stays hidden", async () => {
    const { w, sell } = setup({
      id: "eth",
      name: "ETH",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 0n,
      qty: "0",
      current: 1_000n,
      archived: true,
    });
    await sell({
      ...base,
      destination: {
        kind: "new",
        holding: {
          name: "eth",
          holdingType: "crypto",
          uiType: "crypto",
          quantity: "3",
        },
        priceCents: "1000",
      },
    });
    expect(w.plans[0]!.newHolding).toMatchObject({
      name: "eth",
      quantity: "3",
    });
    expect(w.get("eth").archivedAt).not.toBeNull();
    expect(w.get("eth").quantity).toBe("0");
    expect(w.live().filter((r) => r.holdingId === "eth")).toHaveLength(0);
  });

  test("a new quantity destination uses the given quantity and price", async () => {
    const { w, sell } = setup();
    await sell({
      ...base,
      destination: {
        kind: "new",
        holding: {
          name: "SOL",
          holdingType: "crypto",
          uiType: "crypto",
          quantity: "2",
        },
        priceCents: "1500",
      },
    });
    expect(w.plans[0]!.newHolding).toMatchObject({
      name: "SOL",
      quantity: "2",
      buyPriceCents: 1_500n,
    });
  });

  // UAT 13.1 test 10: destination = quantity × price; received follows.
  test("an existing quantity destination books quantity × its own price; its current price stays", async () => {
    const { w, sell } = setup({
      id: "eth",
      name: "ETH",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 900n,
      qty: "1",
      current: 1_000n,
    });
    const r = await sell({
      ...base,
      receivedCents: "999999",
      destination: { kind: "existing", holdingId: "eth", quantityBought: "2" },
    });
    expect(r.isOk()).toBe(true);
    expect(w.get("eth").quantity).toBe("3");
    expect(w.get("eth").buyPriceCents).toBe(967n); // (900 + 2 × 1,000) / 3
    expect(String(w.get("eth").currentPriceCents)).toBe("1000");
    const [out, inn] = w.live();
    expect(out!.amountCents).toBe(2_000n);
    expect(inn).toMatchObject({ qtyDelta: "2", costDeltaCents: 2_000n });
  });

  test("an existing quantity destination needs a quantity", async () => {
    const { sell } = setup({
      id: "eth",
      name: "ETH",
      holdingType: "crypto",
      uiType: "crypto",
      buy: 900n,
      qty: "1",
      current: 1_000n,
    });
    const r = await sell({
      ...base,
      destination: { kind: "existing", holdingId: "eth" },
    });
    expect(r._unsafeUnwrapErr().message).toBe("quantity_required");
  });

  test("a new tracked destination keeps the chosen buy price and the live current price", async () => {
    const { w, sell } = setup();
    await sell({
      ...base,
      receivedCents: "999999",
      destination: {
        kind: "new",
        holding: {
          name: "USDT",
          holdingType: "crypto",
          uiType: "crypto",
          instrumentId: "44444444-4444-4444-8444-444444444444",
          quantity: "16284.6",
          currentPriceCents: "101",
          currentPriceCurrency: "PLN",
        },
        priceCents: "100",
      },
    });
    expect(w.plans[0]!.newHolding).toMatchObject({
      name: "USDT",
      quantity: "16284.6",
      buyPriceCents: 100n,
      currentPriceCents: "101",
    });
    const [out, inn] = w.live();
    expect(out!.amountCents).toBe(1_628_460n);
    expect(inn).toMatchObject({
      qtyDelta: "16284.6",
      costDeltaCents: 1_628_460n,
    });
  });

  test("a new quantity destination without a feed is valued at the chosen price", async () => {
    const { w, sell } = setup();
    await sell({
      ...base,
      destination: {
        kind: "new",
        holding: {
          name: "Coin",
          holdingType: "commodity",
          uiType: "precious_metals",
          quantity: "2",
        },
        priceCents: "1500",
      },
    });
    expect(w.plans[0]!.newHolding).toMatchObject({
      buyPriceCents: 1_500n,
      currentPriceCents: 1_500n,
    });
  });

  test("a new quantity destination needs a price", async () => {
    const { sell } = setup();
    const r = await sell({
      ...base,
      destination: {
        kind: "new",
        holding: {
          name: "SOL",
          holdingType: "crypto",
          uiType: "crypto",
          quantity: "2",
        },
      },
    });
    expect(r._unsafeUnwrapErr().message).toBe("price_required");
  });

  test("out of investments needs the amount received", async () => {
    const { sell } = setup();
    const r = await sell({
      ...base,
      receivedCents: undefined,
      destination: { kind: "out", wallet: { kind: "nowhere" } },
    });
    expect(r._unsafeUnwrapErr().message).toBe("received_required");
  });

  // UAT 13.1 test 14: one rate per deal — the form's rate(source → received).
  test("a fair PLN → EUR sale books 0 even when the stored EUR → PLN is not reciprocal", async () => {
    const asked: string[] = [];
    const fx = {
      rateAsOf: async (from: string, to: string) => {
        asked.push(`${from}>${to}`);
        const r = (
          { "PLN>EUR": "0.23", "EUR>PLN": "4.32" } as Record<string, string>
        )[`${from}>${to}`];
        return { rate: r!, provider: "stub", isStale: false };
      },
    } as never;
    const w = new MemoryWorld([
      memHold({
        id: "ike",
        name: "IKE",
        uiType: "broker",
        buy: 300_000n,
        current: 300_000n,
      }),
    ]);
    const sell = sellHolding({
      holdingRepo: w.holdingRepo,
      historyRepo: w.historyRepo,
      fxProvider: fx,
    });
    await sell({
      ...who13,
      holdingId: "ike",
      effectiveDate: "2026-10-27",
      left: { valueCents: "0" },
      destination: { kind: "out", wallet: { kind: "nowhere" } },
      receivedCents: "69000",
      receivedCurrency: "EUR",
    });
    const e = w.live()[0]!;
    expect(e.realizedBudgetCents).toBe(0n);
    expect(e.soldCostBudgetCents).toBe(300_000n);
    expect(e.amountCents).toBe(69_000n);
    expect(e.amountCurrency).toBe("EUR");
    expect(asked).not.toContain("EUR>PLN");
  });

  test("a sale dated before the source's latest entry is refused", async () => {
    const { w, sell } = setup();
    w.rows.push({
      ...(w.rows[0] ?? {}),
      id: "old",
      holdingId: "btc",
      kind: "buy",
      effectiveDate: "2026-10-05",
      createdAt: "000000",
      deleted: false,
    } as never);
    const r = await sell({
      ...base,
      destination: { kind: "out", wallet: { kind: "nowhere" } },
    });
    expect(r._unsafeUnwrapErr().message).toBe("before_latest_entry");
  });
});
