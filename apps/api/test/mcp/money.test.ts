import { describe, it, expect } from "bun:test";
import { toMinorUnits, fromMinorUnits } from "../../src/mcp/money";

describe("MCP money boundary", () => {
  it("converts decimal strings to minor units", () => {
    expect(toMinorUnits("12.34", "PLN")._unsafeUnwrap()).toBe(1234);
    expect(toMinorUnits("-5", "EUR")._unsafeUnwrap()).toBe(-500);
    expect(toMinorUnits("0.1", "USD")._unsafeUnwrap()).toBe(10);
    expect(toMinorUnits("12.34", "pln")._unsafeUnwrap()).toBe(1234);
  });

  it("rejects malformed amounts", () => {
    expect(toMinorUnits("12.345", "PLN")._unsafeUnwrapErr()).toBe(
      "too_many_decimals",
    );
    expect(toMinorUnits("1e3", "PLN")._unsafeUnwrapErr()).toBe(
      "invalid_amount",
    );
    expect(toMinorUnits("12,34", "PLN")._unsafeUnwrapErr()).toBe(
      "invalid_amount",
    );
    expect(toMinorUnits("", "PLN")._unsafeUnwrapErr()).toBe("invalid_amount");
  });

  it("rejects unsupported currencies and out-of-range amounts", () => {
    expect(toMinorUnits("1", "XYZ")._unsafeUnwrapErr()).toBe(
      "unsupported_currency",
    );
    expect(toMinorUnits("100000000000.01", "PLN")._unsafeUnwrapErr()).toBe(
      "amount_out_of_range",
    );
    expect(toMinorUnits("100000000000.00", "PLN")._unsafeUnwrap()).toBe(1e13);
  });

  it("formats minor units as decimal strings", () => {
    expect(fromMinorUnits(1234, "PLN")).toBe("12.34");
    expect(fromMinorUnits(-5, "EUR")).toBe("-0.05");
    expect(fromMinorUnits("700", "USD")).toBe("7.00");
  });
});
