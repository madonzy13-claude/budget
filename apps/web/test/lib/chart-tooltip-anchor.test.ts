/**
 * chart-tooltip-anchor.test.ts — where a tooltip may sit (user, 261016).
 *
 * Anchoring to the point put the box's LEFT edge at the point, so a point near
 * the right-hand end of the series pushed the tooltip off the screen — the
 * month label and every amount with it (screenshot: "червень 2027 р." clipped
 * at the edge, the figures gone entirely).
 *
 * The anchor is clamped to the plot instead: never past the right edge, never
 * before the left one. When the box is wider than the plot there is nothing to
 * choose, so it starts at 0 and the width cap does the rest.
 */
import { describe, it, expect } from "vitest";
import { clampAnchorX } from "@/lib/chart-tooltip-anchor";

describe("clampAnchorX", () => {
  it("leaves a point with room to its right where it is", () => {
    expect(clampAnchorX(40, 400, 200)).toBe(40);
  });

  it("pulls a point near the right edge back so the box fits", () => {
    // 380 + 200 would end at 580, past a 400-wide plot → 200.
    expect(clampAnchorX(380, 400, 200)).toBe(200);
  });

  it("never goes negative", () => {
    expect(clampAnchorX(-20, 400, 200)).toBe(0);
  });

  it("starts at the left when the box is wider than the plot", () => {
    expect(clampAnchorX(120, 180, 300)).toBe(0);
  });

  it("is a no-op until the plot has been measured", () => {
    expect(clampAnchorX(250, 0, 200)).toBe(250);
  });
});
