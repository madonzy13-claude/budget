import { describe, test, expect } from "bun:test";
import {
  sellAmountHolding,
  sellQuantityHolding,
  realizedInBudget,
  buyMore,
  addMoney,
  mergeIntoAmountHolding,
  reverseEntry,
  sellDepositPart,
} from "../../src/domain/sell-booking";

describe("Sell an amount holding", () => {
  test("keeps 30k of 96k/55k broker: cost 17,187.50, realized 28,187.50", () => {
    const r = sellAmountHolding({
      buyCents: 5_500_000n,
      valueCents: 9_600_000n,
      keepCents: 3_000_000n,
    });
    expect(r.keptCostCents).toBe(1_718_750n);
    expect(r.soldCostCents).toBe(3_781_250n);
    const fx = realizedInBudget({
      receivedCents: 6_600_000n,
      receivedToBudgetRate: "1",
      soldCostCents: r.soldCostCents,
      costToBudgetRate: "1",
    });
    expect(fx.realizedBudgetCents).toBe(2_818_750n);
  });

  test("row P/L % is unchanged by the sale (+74.5%)", () => {
    const r = sellAmountHolding({
      buyCents: 5_500_000n,
      valueCents: 9_600_000n,
      keepCents: 3_000_000n,
    });
    const pct = (v: bigint, c: bigint) =>
      Math.round((Number(v - c) / Number(c)) * 1000) / 10;
    expect(pct(3_000_000n, r.keptCostCents)).toBe(pct(9_600_000n, 5_500_000n));
    expect(pct(3_000_000n, r.keptCostCents)).toBe(74.5);
  });

  test("withdraw via edit 96k -> 80k: sold cost 9,166.67, realized 6,833.33 (D-03)", () => {
    const r = sellAmountHolding({
      buyCents: 5_500_000n,
      valueCents: 9_600_000n,
      keepCents: 8_000_000n,
    });
    expect(r.keptCostCents).toBe(4_583_333n);
    expect(r.soldCostCents).toBe(916_667n);
    const fx = realizedInBudget({
      receivedCents: 1_600_000n,
      receivedToBudgetRate: "1",
      soldCostCents: r.soldCostCents,
      costToBudgetRate: "1",
    });
    expect(fx.realizedBudgetCents).toBe(683_333n);
  });

  test("keep 0 sells everything", () => {
    const r = sellAmountHolding({
      buyCents: 5_500_000n,
      valueCents: 9_600_000n,
      keepCents: 0n,
    });
    expect(r.keptCostCents).toBe(0n);
    expect(r.soldCostCents).toBe(5_500_000n);
  });

  test("keep = value is nothing to sell", () => {
    expect(() =>
      sellAmountHolding({
        buyCents: 5_500_000n,
        valueCents: 9_600_000n,
        keepCents: 9_600_000n,
      }),
    ).toThrow("keep_out_of_range");
  });

  test("negative keep is rejected", () => {
    expect(() =>
      sellAmountHolding({
        buyCents: 5_500_000n,
        valueCents: 9_600_000n,
        keepCents: -1n,
      }),
    ).toThrow("keep_out_of_range");
  });

  test("zero value is rejected", () => {
    expect(() =>
      sellAmountHolding({ buyCents: 100n, valueCents: 0n, keepCents: 0n }),
    ).toThrow("no_value");
  });
});

describe("Sell a quantity holding", () => {
  test("sells 0.1 of 0.4 BTC @25k: 0.3 left, sold cost 2,500, realized 3,500", () => {
    const r = sellQuantityHolding({
      quantity: "0.4",
      buyPriceCents: 2_500_000n,
      sellQuantity: "0.1",
    });
    expect(r.newQuantity).toBe("0.3");
    expect(r.soldCostCents).toBe(250_000n);
    const fx = realizedInBudget({
      receivedCents: 600_000n,
      receivedToBudgetRate: "1",
      soldCostCents: r.soldCostCents,
      costToBudgetRate: "1",
    });
    expect(fx.realizedBudgetCents).toBe(350_000n);
    // remaining row: 0.3 x 60k = 18k vs cost 7.5k -> +140%
    const value = 1_800_000n;
    const cost = 750_000n;
    expect(Number(((value - cost) * 100n) / cost)).toBe(140);
  });

  test("selling more than held is rejected", () => {
    expect(() =>
      sellQuantityHolding({
        quantity: "0.4",
        buyPriceCents: 2_500_000n,
        sellQuantity: "0.5",
      }),
    ).toThrow("sell_qty_out_of_range");
  });

  test("selling zero is rejected", () => {
    expect(() =>
      sellQuantityHolding({
        quantity: "0.4",
        buyPriceCents: 2_500_000n,
        sellQuantity: "0",
      }),
    ).toThrow("sell_qty_out_of_range");
  });
});

describe("Realized gain in budget currency (D-18)", () => {
  test("both sides converted at the sale-date rate", () => {
    const r = realizedInBudget({
      receivedCents: 110_000n,
      receivedToBudgetRate: "4.30",
      soldCostCents: 100_000n,
      costToBudgetRate: "4.30",
    });
    expect(r.soldCostBudgetCents).toBe(430_000n);
    expect(r.receivedBudgetCents).toBe(473_000n);
    expect(r.realizedBudgetCents).toBe(43_000n);
  });

  test("a sale at 0% books 0 realized", () => {
    const r = realizedInBudget({
      receivedCents: 100_000n,
      receivedToBudgetRate: "4.30",
      soldCostCents: 100_000n,
      costToBudgetRate: "4.30",
    });
    expect(r.realizedBudgetCents).toBe(0n);
  });
});

describe("Add to a holding", () => {
  test("buyMore averages the unit price", () => {
    const r = buyMore({
      quantity: "1",
      buyPriceCents: 1_000_000n,
      addQuantity: "1",
      paidCents: 3_000_000n,
    });
    expect(r.newQuantity).toBe("2");
    expect(r.newBuyPriceCents).toBe(2_000_000n);
  });

  test("addMoney raises cost by the amount", () => {
    expect(addMoney({ buyCents: 5_500_000n, amountCents: 1_000_000n })).toEqual(
      { newBuyCents: 6_500_000n },
    );
  });

  test("mergeIntoAmountHolding raises cost and value by what was received", () => {
    expect(
      mergeIntoAmountHolding({
        buyCents: 1_000_000n,
        currentCents: 1_200_000n,
        receivedCents: 6_600_000n,
      }),
    ).toEqual({ newBuyCents: 7_600_000n, newCurrentCents: 7_800_000n });
  });
});

describe("Sell part of a deposit (D-20)", () => {
  test("take out 4,000 of 10,500 (principal 10,000): realized = all interest 500", () => {
    const r = sellDepositPart({
      principalCents: 1_000_000n,
      valueCents: 1_050_000n,
      keepCents: 650_000n,
    });
    expect(r.newPrincipalCents).toBe(650_000n);
    expect(r.soldCostCents).toBe(350_000n);
    const fx = realizedInBudget({
      receivedCents: 400_000n,
      receivedToBudgetRate: "1",
      soldCostCents: r.soldCostCents,
      costToBudgetRate: "1",
    });
    expect(fx.realizedBudgetCents).toBe(50_000n);
  });

  test("keep above principal gives negative sold cost; realized still 500", () => {
    const r = sellDepositPart({
      principalCents: 1_000_000n,
      valueCents: 1_050_000n,
      keepCents: 1_020_000n,
    });
    expect(r.soldCostCents).toBe(-20_000n);
    const fx = realizedInBudget({
      receivedCents: 30_000n,
      receivedToBudgetRate: "1",
      soldCostCents: r.soldCostCents,
      costToBudgetRate: "1",
    });
    expect(fx.realizedBudgetCents).toBe(50_000n);
  });

  test("keep = value is nothing to sell", () => {
    expect(() =>
      sellDepositPart({
        principalCents: 1_000_000n,
        valueCents: 1_050_000n,
        keepCents: 1_050_000n,
      }),
    ).toThrow("keep_out_of_range");
  });
});

describe("reverseEntry (D-06 full undo)", () => {
  test("undoes a broker partial withdraw", () => {
    expect(
      reverseEntry({
        shape: "amount",
        quantity: "1",
        buyPriceCents: 1_718_750n,
        currentPriceCents: 3_000_000n,
        qtyDelta: null,
        costDeltaCents: -3_781_250n,
        valueDeltaCents: -6_600_000n,
      }),
    ).toEqual({
      quantity: "1",
      buyPriceCents: 5_500_000n,
      currentPriceCents: 9_600_000n,
    });
  });

  test("undoes a BTC sale", () => {
    const r = reverseEntry({
      shape: "quantity",
      quantity: "0.3",
      buyPriceCents: 2_500_000n,
      currentPriceCents: 6_000_000n,
      qtyDelta: "-0.1",
      costDeltaCents: -250_000n,
      valueDeltaCents: 0n,
    });
    expect(r).toEqual({
      quantity: "0.4",
      buyPriceCents: 2_500_000n,
      currentPriceCents: 6_000_000n,
    });
  });

  test("undoing the first of two sales keeps the later sale", () => {
    const r = reverseEntry({
      shape: "quantity",
      quantity: "0.2",
      buyPriceCents: 2_500_000n,
      currentPriceCents: 6_000_000n,
      qtyDelta: "-0.1",
      costDeltaCents: -250_000n,
      valueDeltaCents: 0n,
    });
    expect(r.quantity).toBe("0.3");
    expect(r.buyPriceCents).toBe(2_500_000n);
  });

  test("undoes a conversion into an existing cash holding", () => {
    expect(
      reverseEntry({
        shape: "amount",
        quantity: "1",
        buyPriceCents: 7_600_000n,
        currentPriceCents: 7_600_000n,
        qtyDelta: null,
        costDeltaCents: 6_600_000n,
        valueDeltaCents: 6_600_000n,
      }),
    ).toEqual({
      quantity: "1",
      buyPriceCents: 1_000_000n,
      currentPriceCents: 1_000_000n,
    });
  });

  test("undoes a buy-more", () => {
    const r = reverseEntry({
      shape: "quantity",
      quantity: "2",
      buyPriceCents: 2_000_000n,
      currentPriceCents: null,
      qtyDelta: "1",
      costDeltaCents: 3_000_000n,
      valueDeltaCents: 0n,
    });
    expect(r).toEqual({
      quantity: "1",
      buyPriceCents: 1_000_000n,
      currentPriceCents: null,
    });
  });

  test("delete-then-re-enter does not double count", () => {
    const start = { buy: 5_500_000n, value: 9_600_000n };
    const sale = sellAmountHolding({
      buyCents: start.buy,
      valueCents: start.value,
      keepCents: 3_000_000n,
    });
    const undone = reverseEntry({
      shape: "amount",
      quantity: "1",
      buyPriceCents: sale.keptCostCents,
      currentPriceCents: 3_000_000n,
      qtyDelta: null,
      costDeltaCents: -sale.soldCostCents,
      valueDeltaCents: -6_600_000n,
    });
    const again = sellAmountHolding({
      buyCents: undone.buyPriceCents,
      valueCents: undone.currentPriceCents!,
      keepCents: 3_000_000n,
    });
    expect(again).toEqual(sale);
  });

  test("undoing the only quantity would empty the holding", () => {
    expect(() =>
      reverseEntry({
        shape: "quantity",
        quantity: "0.4",
        buyPriceCents: 2_500_000n,
        currentPriceCents: null,
        qtyDelta: "0.4",
        costDeltaCents: 1_000_000n,
        valueDeltaCents: 0n,
      }),
    ).toThrow("would_empty_holding");
  });

  test("undo that would push value below zero is rejected", () => {
    expect(() =>
      reverseEntry({
        shape: "amount",
        quantity: "1",
        buyPriceCents: 1_000_000n,
        currentPriceCents: 500_000n,
        qtyDelta: null,
        costDeltaCents: 1_000_000n,
        valueDeltaCents: 1_000_000n,
      }),
    ).toThrow("would_go_negative");
  });
});
