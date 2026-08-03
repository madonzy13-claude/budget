/**
 * slice-colors.test.ts — one colour per slice (260803).
 *
 * The pie coloured slice i with CATEGORY_COLORS[i % 8], so a budget with more
 * than eight categories wrapped and two slices came out identical — Investments
 * arrived and took Kids' green (user screenshot). A persisted colorKey can also
 * collide with a fallback. Colours are handed out so no two slices share one.
 */
import { describe, it, expect } from "vitest";
import { assignSliceColors, SLICE_PALETTE } from "../../src/lib/slice-colors";

const names = (n: number) => Array.from({ length: n }, (_, i) => `cat${i}`);

describe("assignSliceColors", () => {
  it("keeps a category's own colour when nothing else has taken it", () => {
    const out = assignSliceColors(["Food", "Kids"], (n) =>
      n === "Food" ? "#F0B90B" : null,
    );
    expect(out.get("Food")).toBe("#F0B90B");
  });

  it("gives the second of two same-coloured categories a different one", () => {
    // Kids and Investments both persisted green — the pie drew one wedge in two
    // places and they read as a single slice (user report).
    const out = assignSliceColors(["Kids", "Investments"], () => "#26A69A");
    expect(out.get("Kids")).toBe("#26A69A");
    expect(out.get("Investments")).not.toBe("#26A69A");
  });

  it("never repeats a colour across a budget with more than eight categories", () => {
    const out = assignSliceColors(names(16), () => null);
    const used = [...out.values()];
    expect(used).toHaveLength(16);
    expect(new Set(used).size).toBe(16);
  });

  it("has palette enough for a big budget", () => {
    expect(new Set(SLICE_PALETTE).size).toBe(SLICE_PALETTE.length);
    expect(SLICE_PALETTE.length).toBeGreaterThanOrEqual(24);
  });

  it("still answers for every slice once the palette runs out", () => {
    const many = names(SLICE_PALETTE.length + 5);
    const out = assignSliceColors(many, () => null);
    expect(out.size).toBe(many.length);
    for (const n of many) expect(out.get(n)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("is stable — the same input gives the same colours", () => {
    const of = (n: string) => (n === "cat3" ? "#EC407A" : null);
    expect([...assignSliceColors(names(12), of)]).toEqual([
      ...assignSliceColors(names(12), of),
    ]);
  });
});
