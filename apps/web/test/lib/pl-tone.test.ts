import { describe, it, expect } from "vitest";
import { plTone, plPctDecimals, PL_TONE_CLASS } from "@/lib/pl-tone";

/**
 * Every P/L readout used `delta >= 0` to pick its colour, so a delta of exactly
 * zero rendered as a GAIN: green, up-arrow, "+0.0%". Zero is common — the wealth
 * series is carry-forward filled, so "no snapshot yet today" makes
 * current − base literally 0n (see dayCloseDelta).
 */
describe("plTone", () => {
  it("treats an exact zero as flat, not as a gain", () => {
    expect(plTone("0")).toBe("flat");
    expect(plTone(0)).toBe("flat");
    expect(plTone(-0)).toBe("flat");
    expect(plTone(0n)).toBe("flat");
  });

  it("keeps real movement directional", () => {
    expect(plTone("1")).toBe("up");
    expect(plTone("-1")).toBe("down");
    expect(plTone(750000)).toBe("up");
    expect(plTone(-340709)).toBe("down");
  });

  it("is flat when there is no number at all", () => {
    // delta_pct is null when the base value is zero — no direction to show.
    expect(plTone(null)).toBe("flat");
    expect(plTone(undefined)).toBe("flat");
    expect(plTone(Number.NaN)).toBe("flat");
  });

  it("maps flat to the muted token, never to a trading colour", () => {
    expect(PL_TONE_CLASS.flat).toContain("--muted-foreground");
    expect(PL_TONE_CLASS.up).toContain("--trading-up");
    expect(PL_TONE_CLASS.down).toContain("--trading-down");
  });
});

/**
 * Real case (user, 260819): Mój Budżet moved +17 gr overnight — +0.0071% of
 * 2,393 zł. That IS a gain, so it stays green; the fix is precision, not
 * colour. One decimal hid it as "0.0%", so the percent grows decimals until a
 * significant digit appears ("0.007%").
 */
describe("plPctDecimals", () => {
  it("keeps one decimal whenever that already shows something", () => {
    expect(plPctDecimals(2.5)).toBe(1);
    expect(plPctDecimals(-2.5)).toBe(1);
    expect(plPctDecimals(0.05)).toBe(1); // rounds to "0.1"
  });

  it("grows to the first significant digit when one decimal shows 0.0", () => {
    expect(plPctDecimals(0.0071)).toBe(3); // "0.007"
    expect(plPctDecimals(-0.0071)).toBe(3);
    expect(plPctDecimals(0.049)).toBe(2); // "0.05"
    expect(plPctDecimals(0.00004)).toBe(5); // "0.00004"
  });

  it("stops at the cap rather than printing a wall of zeroes", () => {
    expect(plPctDecimals(1e-12)).toBe(6);
    expect(plPctDecimals(1e-12, 3)).toBe(3);
  });

  it("falls back to one decimal for zero or no value", () => {
    expect(plPctDecimals(0)).toBe(1);
    expect(plPctDecimals(null)).toBe(1);
    expect(plPctDecimals(undefined)).toBe(1);
    expect(plPctDecimals(Number.NaN)).toBe(1);
  });
});

/**
 * The depth is chosen so the FIRST SIGNIFICANT DIGIT survives — but it is
 * chosen from the raw value, and rounding to that depth can carry the digit one
 * place to the left, leaving a zero on the end that says nothing.
 *
 * Live, 260930: −155 zł against 1,585,738 zł is −0.009774…%. The first
 * significant digit sits at the third decimal, so the rule asked for three —
 * and three rounds to "0.010". Two would have printed "0.01": the same value,
 * without the dead digit (user, 260930).
 */
describe("plPctDecimals — no trailing zero the rounding invented", () => {
  it("drops the place that rounding carried away", () => {
    // −0.009774…% → "0.01", not "0.010".
    expect(plPctDecimals((155 / 1585738) * 100)).toBe(2);
  });

  it("keeps the place when it still carries a digit", () => {
    // 0.0071 → "0.007": rounding to 2 would say "0.01", which is a different
    // number, so the third place is doing work.
    expect(plPctDecimals(0.0071)).toBe(3);
  });

  it("keeps rounding UP into view rather than printing zero", () => {
    // The original reason the rule exists: 0.049 → "0.05", never "0.0".
    expect(plPctDecimals(0.049)).toBe(2);
  });
});
