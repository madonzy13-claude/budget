import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  hexForColorKey,
  type CategoryColorKey,
} from "./category-colors";

describe("category-colors", () => {
  it("has the 20 palette entries with the exact verified hexes", () => {
    expect(CATEGORY_COLORS).toHaveLength(20);
    const map = Object.fromEntries(CATEGORY_COLORS.map((c) => [c.key, c.hex]));
    expect(map).toEqual({
      yellow: "#F0B90B",
      green: "#26A69A",
      blue: "#4A90D9",
      red: "#EF5350",
      orange: "#FF8F00",
      purple: "#7C4DFF",
      pink: "#EC407A",
      gray: "#78909C",
      cyan: "#00ACC1",
      lime: "#9CCC65",
      indigo: "#5C6BC0",
      teal: "#009688",
      amber: "#FFB300",
      brown: "#8D6E63",
      magenta: "#D81B60",
      olive: "#827717",
      navy: "#3949AB",
      coral: "#FF7043",
      mint: "#4DB6AC",
      slate: "#546E7A",
    });
  });

  it("hexForColorKey returns the hex for a known key", () => {
    expect(hexForColorKey("blue")).toBe("#4A90D9");
    expect(hexForColorKey("green")).toBe("#26A69A");
  });

  it("hexForColorKey returns null for null / undefined / unknown key", () => {
    expect(hexForColorKey(null)).toBeNull();
    expect(hexForColorKey(undefined)).toBeNull();
    expect(hexForColorKey("")).toBeNull();
    expect(hexForColorKey("mauve")).toBeNull();
  });

  it("CategoryColorKey covers every entry key", () => {
    const keys: CategoryColorKey[] = CATEGORY_COLORS.map((c) => c.key);
    expect(keys).toContain("yellow");
    expect(keys).toContain("gray");
    expect(keys).toContain("slate");
  });

  it("every key is unique and every hex is a full 6-digit value", () => {
    const keys = CATEGORY_COLORS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of CATEGORY_COLORS)
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("fills whole rows of ten, so the picker never leaves a ragged tail", () => {
    expect(CATEGORY_COLORS.length % 10).toBe(0);
  });
});
