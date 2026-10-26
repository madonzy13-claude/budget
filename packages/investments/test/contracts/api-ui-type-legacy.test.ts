import { describe, test, expect } from "bun:test";
import {
  uiTypeSchema,
  createHoldingSchema,
  updateHoldingSchema,
  UI_TYPE_KEYS,
  UI_TYPE_TO_HOLDING_TYPE,
} from "../../src/contracts/api";

// Phase 13 (D-10/D-11): equity + ETF are one "stocks" type. A stale client may
// still send the old names — normalize them instead of rejecting the save.
describe("ui type contract after the stocks merge", () => {
  test.each([
    ["equity", "stocks"],
    ["etf", "stocks"],
    ["reit", "stocks"],
    ["etb", "treasury_bond"],
    ["stocks", "stocks"],
    ["crypto", "crypto"],
  ])("%s parses as %s", (input, out) => {
    expect(uiTypeSchema.parse(input)).toBe(out);
  });

  test("unknown types are rejected", () => {
    expect(() => uiTypeSchema.parse("bogus")).toThrow();
  });

  test("create normalizes a legacy ui type", () => {
    const parsed = createHoldingSchema.parse({
      name: "VWCE",
      holdingType: "etf",
      uiType: "etf",
    });
    expect(parsed.uiType).toBe("stocks");
  });

  test("stocks routes to equities pricing", () => {
    expect(UI_TYPE_TO_HOLDING_TYPE.stocks).toBe("equities");
  });

  test("type keys are the 11 investment types (no possession)", () => {
    expect(UI_TYPE_KEYS).toHaveLength(11);
    expect(UI_TYPE_KEYS).toContain("stocks");
    expect(UI_TYPE_KEYS).not.toContain("possession");
  });

  test("an empty PATCH still invents no quantity", () => {
    expect("quantity" in updateHoldingSchema.parse({})).toBe(false);
  });
});
