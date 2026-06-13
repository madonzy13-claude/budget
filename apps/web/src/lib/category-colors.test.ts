import { describe, it, expect } from "vitest";
import {
  CATEGORY_COLORS,
  hexForColorKey,
  type CategoryColorKey,
} from "./category-colors";

describe("category-colors", () => {
  it("has the 8 palette entries with the exact verified hexes", () => {
    expect(CATEGORY_COLORS).toHaveLength(8);
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
  });
});
