/**
 * swap-summary.test.ts — the pre-submit "What will happen" card (13.1 D-31,
 * UI-SPEC 2d). Pure line builder: one table row per tab/case.
 */
import { describe, it, expect } from "vitest";
import { buildSwapSummary, type SwapCase } from "../../src/lib/swap-summary";

const src = { name: "BTC", v0: 100_000, v1: 60_000, ccy: "PLN" };
const keys = (c: SwapCase) => {
  const s = buildSwapSummary(c);
  return s.empty ? "empty" : s.lines.map((l) => l.key);
};

describe("Swap summary", () => {
  it("buy quantity: asset qty and value move", () => {
    const s = buildSwapSummary({
      tab: "buy",
      shape: "quantity",
      name: "BTC",
      qty0: 1,
      qty1: 1.5,
      v0: 100,
      v1: 150,
      ccy: "USD",
    });
    expect(s.empty).toBe(false);
    if (s.empty) return;
    expect(s.lines[0]).toMatchObject({
      key: "swap.sum.line",
      label: "BTC",
      before: 1,
      after: 1.5,
      unit: "qty",
    });
    expect(s.lines[1]).toMatchObject({
      key: "swap.sum.line",
      labelKey: "edit.currentValue",
      before: 100,
      after: 150,
      ccy: "USD",
    });
  });

  it("buy cash: value moves, P/L unchanged", () => {
    expect(
      keys({
        tab: "buy",
        shape: "amount",
        name: "Cash",
        v0: 100,
        v1: 150,
        ccy: "PLN",
      }),
    ).toEqual(["swap.sum.line", "swap.sum.plUnchanged"]);
  });

  it("buy broker: value moves plus the market / deposit split", () => {
    const s = buildSwapSummary({
      tab: "buy",
      shape: "broker",
      name: "IKE",
      v0: 12_000_000,
      v1: 13_325_000,
      ccy: "PLN",
      marketCents: 325_000,
      depositCents: 0,
    });
    expect(s.empty ? [] : s.lines.map((l) => l.key)).toEqual([
      "swap.sum.line",
      "swap.buy.split",
    ]);
  });

  it("sell into a new asset", () => {
    expect(
      keys({
        tab: "sell",
        ...src,
        dest: { kind: "new", name: "ETH", amount: 40_000, ccy: "PLN" },
        realized: 5_000,
        realizedCcy: "PLN",
      }),
    ).toEqual(["swap.sum.line", "swap.sum.created", "swap.sum.realized"]);
  });

  it("sell into an existing asset", () => {
    expect(
      keys({
        tab: "sell",
        ...src,
        dest: { kind: "existing", name: "ETH", d0: 10, d1: 50, ccy: "PLN" },
        realized: -2,
        realizedCcy: "PLN",
      }),
    ).toEqual(["swap.sum.line", "swap.sum.line", "swap.sum.realized"]);
  });

  it("sell out into an existing wallet, a new wallet, or nowhere", () => {
    const base = {
      tab: "sell" as const,
      ...src,
      realized: 1,
      realizedCcy: "PLN",
    };
    expect(
      keys({
        ...base,
        dest: { kind: "wallet", name: "Bank", b0: 10, b1: 50, ccy: "PLN" },
      }),
    ).toEqual(["swap.sum.line", "swap.sum.line", "swap.sum.realized"]);
    expect(
      keys({
        ...base,
        dest: { kind: "newWallet", name: "Bank", amount: 40, ccy: "PLN" },
      }),
    ).toEqual(["swap.sum.line", "swap.sum.walletNew", "swap.sum.realized"]);
    expect(keys({ ...base, dest: { kind: "nowhere" } })).toEqual([
      "swap.sum.line",
      "swap.sum.leaves",
      "swap.sum.realized",
    ]);
  });

  it("transfer to an existing or a new asset", () => {
    expect(
      keys({
        tab: "transfer",
        ...src,
        dest: { kind: "existing", name: "Cold", t0: 0, t1: 40_000, ccy: "PLN" },
      }),
    ).toEqual(["swap.sum.line", "swap.sum.line", "swap.sum.realizedUnchanged"]);
    expect(
      keys({
        tab: "transfer",
        ...src,
        dest: { kind: "new", name: "Cold", amount: 40_000, ccy: "PLN" },
      }),
    ).toEqual(["swap.sum.line", "swap.sum.created"]);
  });

  it("selling everything says the asset is gone", () => {
    const s = buildSwapSummary({
      tab: "sell",
      ...src,
      v1: 0,
      dest: { kind: "nowhere" },
      realized: 0,
      realizedCcy: "PLN",
    });
    expect(s.empty ? null : s.lines[0]).toMatchObject({
      key: "swap.sum.line",
      gone: true,
    });
  });

  it("invalid input is empty", () => {
    expect(
      buildSwapSummary({
        tab: "sell",
        ...src,
        v1: Number.NaN,
        dest: { kind: "nowhere" },
        realized: 0,
        realizedCcy: "PLN",
      }),
    ).toEqual({ empty: true });
    expect(buildSwapSummary(null)).toEqual({ empty: true });
  });

  it("a single resulting figure is shown as the display figure", () => {
    const one = buildSwapSummary({
      tab: "transfer",
      ...src,
      dest: { kind: "new", name: "Cold", amount: 40_000, ccy: "PLN" },
    });
    expect(one.empty ? null : one.display).toBe(false);
    const cash = buildSwapSummary({
      tab: "buy",
      shape: "amount",
      name: "Cash",
      v0: 1,
      v1: 2,
      ccy: "PLN",
    });
    expect(cash.empty ? null : cash.display).toBe(true);
  });
});
