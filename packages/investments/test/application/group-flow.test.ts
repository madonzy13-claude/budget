import { describe, test, expect } from "bun:test";
import {
  withdrawalLeg,
  realizedCentsByGroup,
} from "../../src/application/group-flow";
import type { GroupFlowLeg } from "../../src/ports/holding-repo";

describe("withdrawalLeg", () => {
  test("books cost and proceeds for a partial sell", () => {
    // Sell 0.3 BTC bought at $5,000 (500000c), now $10,000 (1000000c).
    const leg = withdrawalLeg({
      leavingQty: "0.3",
      buyPriceCents: 500000n,
      buyCurrency: "USD",
      sellPriceCents: 1000000n,
      sellCurrency: "USD",
    });
    expect(leg).not.toBeNull();
    expect(leg!.costCents).toBe(150000n); // 0.3 × 500000
    expect(leg!.proceedsCents).toBe(300000n); // 0.3 × 1000000
    expect(leg!.costCurrency).toBe("USD");
    expect(leg!.proceedsCurrency).toBe("USD");
  });

  test("returns null with no basis (cash) or no price", () => {
    expect(
      withdrawalLeg({
        leavingQty: "1",
        buyPriceCents: null,
        buyCurrency: "USD",
        sellPriceCents: 1000n,
        sellCurrency: "USD",
      }),
    ).toBeNull();
    expect(
      withdrawalLeg({
        leavingQty: "1",
        buyPriceCents: 1000n,
        buyCurrency: "USD",
        sellPriceCents: null,
        sellCurrency: "USD",
      }),
    ).toBeNull();
  });

  test("returns null for a non-positive quantity", () => {
    expect(
      withdrawalLeg({
        leavingQty: "0",
        buyPriceCents: 1000n,
        buyCurrency: "USD",
        sellPriceCents: 2000n,
        sellCurrency: "USD",
      }),
    ).toBeNull();
  });
});

describe("realizedCentsByGroup", () => {
  test("sums proceeds − cost per group at par FX", () => {
    const legs: GroupFlowLeg[] = [
      {
        groupName: "Crypto",
        costCents: 150000n,
        costCurrency: "USD",
        proceedsCents: 300000n,
        proceedsCurrency: "USD",
      },
      {
        groupName: "Crypto",
        costCents: 100000n,
        costCurrency: "USD",
        proceedsCents: 120000n,
        proceedsCurrency: "USD",
      },
    ];
    const realized = realizedCentsByGroup(legs, () => "1");
    // (300000-150000) + (120000-100000) = 170000
    expect(realized.Crypto).toBe("170000");
  });

  test("converts each leg to the budget currency by its own rate", () => {
    const legs: GroupFlowLeg[] = [
      {
        groupName: "PL",
        costCents: 100000n,
        costCurrency: "PLN",
        proceedsCents: 200000n,
        proceedsCurrency: "PLN",
      },
    ];
    // PLN→budget at 0.25 → (200000−100000)×0.25 = 25000
    const realized = realizedCentsByGroup(legs, (c) =>
      c === "PLN" ? "0.25" : "1",
    );
    expect(realized.PL).toBe("25000");
  });
});
