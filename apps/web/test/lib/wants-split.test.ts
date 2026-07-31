/**
 * wants-split.test.ts — should the pink WANTS band be drawn? (260731)
 *
 * A budget with no needs/wants split reports the same figure in both series, so
 * stacking them would double the planned band and paint a pink copy of the green
 * one. The band is drawn only when at least one point genuinely differs.
 */
import { describe, it, expect } from "vitest";
import { hasWantsSplit } from "../../src/lib/wants-split";

describe("hasWantsSplit", () => {
  it("false when every point reports wants === needs", () => {
    expect(
      hasWantsSplit([
        { needs_cents: "50000", wants_cents: "50000" },
        { needs_cents: "20000", wants_cents: "20000" },
      ]),
    ).toBe(false);
  });

  it("true as soon as one point differs", () => {
    expect(
      hasWantsSplit([
        { needs_cents: "50000", wants_cents: "50000" },
        { needs_cents: "20000", wants_cents: "7500" },
      ]),
    ).toBe(true);
  });

  it("false for a needs-only budget — a zero band still strokes a stray line", () => {
    expect(hasWantsSplit([{ needs_cents: "50000", wants_cents: "0" }])).toBe(
      false,
    );
  });

  it("true when at least one point carries real, distinct wants money", () => {
    expect(
      hasWantsSplit([
        { needs_cents: "50000", wants_cents: "0" },
        { needs_cents: "50000", wants_cents: "12500" },
      ]),
    ).toBe(true);
  });

  it("false for an all-zero timeline (nothing to split)", () => {
    expect(hasWantsSplit([{ needs_cents: "0", wants_cents: "0" }])).toBe(false);
  });

  it("false for an empty timeline", () => {
    expect(hasWantsSplit([])).toBe(false);
  });

  it("compares numerically, not as strings", () => {
    expect(hasWantsSplit([{ needs_cents: "500", wants_cents: 500 }])).toBe(
      false,
    );
  });
});
