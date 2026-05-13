import { describe, it, expect } from "vitest";
import { parseDecimal } from "../../src/lib/decimal";

describe("parseDecimal", () => {
  it("parses '5.96' to 596 cents", () =>
    expect(parseDecimal("5.96")).toBe(596));
  it("parses '5,96' to 596 cents (locale tolerance, D-PH4-Q2)", () =>
    expect(parseDecimal("5,96")).toBe(596));
  it("parses '0.01' to 1 cent", () => expect(parseDecimal("0.01")).toBe(1));
  it("parses '99999.99' to 9999999 cents", () =>
    expect(parseDecimal("99999.99")).toBe(9999999));
  it("rejects '1.234' (>2 decimals)", () =>
    expect(parseDecimal("1.234")).toBeNull());
  it("rejects '.96' (no leading digit)", () =>
    expect(parseDecimal(".96")).toBeNull());
  it("collapses '5..96' double separator to '5.96' = 596 cents", () =>
    expect(parseDecimal("5..96")).toBe(596));
  it("rejects 'abc'", () => expect(parseDecimal("abc")).toBeNull());
  it("rejects ''", () => expect(parseDecimal("")).toBeNull());
  it("strips non-digit chars so '596' is treated as integer 596 cents", () =>
    expect(parseDecimal("596")).toBe(59600));
  it("parses '10' as 1000 cents (no decimal)", () =>
    expect(parseDecimal("10")).toBe(1000));
});
