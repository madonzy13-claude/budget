import { describe, test, expect } from "bun:test";
import {
  holdingTypeSchema,
  uiTypeSchema,
  UI_TYPE_TO_HOLDING_TYPE,
  createHoldingSchema,
} from "../../src/contracts/api";

describe("savings contract", () => {
  test("holdingTypeSchema + uiTypeSchema accept 'savings'", () => {
    expect(holdingTypeSchema.parse("savings")).toBe("savings");
    expect(uiTypeSchema.parse("savings")).toBe("savings");
  });

  test("savings uiType maps to the savings coarse holding_type (own pie slice)", () => {
    expect(UI_TYPE_TO_HOLDING_TYPE.savings).toBe("savings");
  });

  test("createHoldingSchema parses a savings payload (starting/current, qty default 1)", () => {
    const parsed = createHoldingSchema.parse({
      name: "Emergency fund",
      holdingType: "savings",
      uiType: "savings",
      buyCurrency: "USD",
      currentPriceCurrency: "USD",
      buyPriceCents: 1_000_000, // starting
      currentPriceCents: 1_250_000, // current
      // no quantity -> defaults to "1"
    });
    expect(parsed.holdingType).toBe("savings");
    expect(parsed.uiType).toBe("savings");
    expect(parsed.quantity).toBe("1");
  });
});
