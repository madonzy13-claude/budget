import { describe, test, expect } from "bun:test";
import {
  holdingTypeSchema,
  uiTypeSchema,
  UI_TYPE_TO_HOLDING_TYPE,
  createHoldingSchema,
} from "../../src/contracts/api";

describe("possession contract", () => {
  test("holdingTypeSchema + uiTypeSchema accept 'possession'", () => {
    expect(holdingTypeSchema.parse("possession")).toBe("possession");
    expect(uiTypeSchema.parse("possession")).toBe("possession");
  });

  test("possession uiType maps to the possession coarse holding_type", () => {
    expect(UI_TYPE_TO_HOLDING_TYPE.possession).toBe("possession");
  });

  test("createHoldingSchema parses a possession payload (single amount + icon, qty default 1)", () => {
    const parsed = createHoldingSchema.parse({
      name: "Family car",
      holdingType: "possession",
      uiType: "possession",
      currentPriceCurrency: "USD",
      currentPriceCents: 2_500_000, // its value
      icon: "car",
      // no quantity -> defaults to "1"
    });
    expect(parsed.holdingType).toBe("possession");
    expect(parsed.uiType).toBe("possession");
    expect(parsed.quantity).toBe("1");
    expect(parsed.icon).toBe("car");
  });

  test("icon is optional (nullish) on the holding schema", () => {
    const parsed = createHoldingSchema.parse({
      name: "Apple",
      holdingType: "equities",
      currentPriceCurrency: "USD",
      currentPriceCents: 10_000,
    });
    expect(parsed.icon ?? null).toBeNull();
  });
});
