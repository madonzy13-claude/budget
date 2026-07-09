import { describe, it, expect } from "vitest";
import { overspendHeat } from "@/lib/overspend-heat";

const GREEN = "var(--trading-up)";
const YELLOW = "var(--primary)";
const RED = "var(--trading-down)";

describe("overspendHeat thresholds", () => {
  it("overspent > +10% → red", () => {
    expect(overspendHeat(10.1)).toBe(RED);
    expect(overspendHeat(200)).toBe(RED);
  });

  it("underspent < −10% → yellow", () => {
    expect(overspendHeat(-10.1)).toBe(YELLOW);
    expect(overspendHeat(-90)).toBe(YELLOW);
  });

  it("within ±10% (on track) → green", () => {
    expect(overspendHeat(-10)).toBe(GREEN);
    expect(overspendHeat(0)).toBe(GREEN);
    expect(overspendHeat(10)).toBe(GREEN);
  });
});
