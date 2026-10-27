import { describe, test, expect } from "bun:test";
import { createHoldingSchema, editAssetSchema } from "../../src/contracts/api";

// user, 261023: an inline price edit on a 3-unit holding came back as 1 unit.
// `.partial()` keeps a field's `.default()`, so every PATCH that left quantity
// out was parsed as quantity "1" and written over the real one.
describe("create holding contract", () => {
  test("create still defaults quantity to 1", () => {
    expect(
      createHoldingSchema.parse({ name: "X", holdingType: "other" }).quantity,
    ).toBe("1");
  });
});

describe("edit asset contract (13.1)", () => {
  test("a label-only edit injects no default key", () => {
    const parsed = editAssetSchema.parse({ name: "BTC" });
    expect(Object.keys(parsed)).toEqual(["name"]);
  });
});
