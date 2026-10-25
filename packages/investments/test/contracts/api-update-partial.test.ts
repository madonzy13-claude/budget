import { describe, test, expect } from "bun:test";
import {
  createHoldingSchema,
  updateHoldingSchema,
} from "../../src/contracts/api";

// user, 261023: an inline price edit on a 3-unit holding came back as 1 unit.
// `.partial()` keeps a field's `.default()`, so every PATCH that left quantity
// out was parsed as quantity "1" and written over the real one.
describe("update holding contract", () => {
  test("a PATCH that omits quantity does not invent one", () => {
    const parsed = updateHoldingSchema.parse({ currentPriceCents: "15000" });
    expect("quantity" in parsed).toBe(false);
  });

  test("a PATCH that sends quantity keeps it", () => {
    expect(updateHoldingSchema.parse({ quantity: "3" }).quantity).toBe("3");
  });

  test("create still defaults quantity to 1", () => {
    expect(
      createHoldingSchema.parse({ name: "X", holdingType: "other" }).quantity,
    ).toBe("1");
  });
});
