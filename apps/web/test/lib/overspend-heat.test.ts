import { describe, it, expect } from "vitest";
import { overspendHeat } from "@/lib/overspend-heat";

const GREEN = "var(--trading-up)";
const YELLOW = "var(--primary)";
const ORANGE = "color-mix(in oklab, var(--primary) 45%, var(--trading-down))";
const RED = "var(--trading-down)";

describe("overspendHeat thresholds", () => {
  it("under / on budget (≤ 0%) → green", () => {
    expect(overspendHeat(-20)).toBe(GREEN);
    expect(overspendHeat(0)).toBe(GREEN);
  });

  it("slightly over (0–10%) → yellow", () => {
    expect(overspendHeat(0.1)).toBe(YELLOW);
    expect(overspendHeat(10)).toBe(YELLOW);
  });

  it("over (10–25%) → orange", () => {
    expect(overspendHeat(10.1)).toBe(ORANGE);
    expect(overspendHeat(25)).toBe(ORANGE);
  });

  it("critically over (> 25%) → red", () => {
    expect(overspendHeat(25.1)).toBe(RED);
    expect(overspendHeat(200)).toBe(RED);
  });
});
