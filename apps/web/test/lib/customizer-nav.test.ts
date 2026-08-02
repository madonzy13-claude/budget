import { describe, it, expect } from "vitest";
import {
  nextCustomizerFocus,
  type GridPos,
  type GridSection,
} from "@/lib/customizer-nav";

// color row = 8 swatches in 8 cols (1 row); icon grid = 12 icons in 6 cols (2 rows).
const TWO: GridSection[] = [
  { count: 8, cols: 8 },
  { count: 12, cols: 6 },
];

describe("customizer-nav", () => {
  it("steps within a section on ←/→, wrapping", () => {
    expect(
      nextCustomizerFocus({ section: 0, index: 0 }, "ArrowRight", TWO),
    ).toEqual({
      section: 0,
      index: 1,
    });
    expect(
      nextCustomizerFocus({ section: 0, index: 7 }, "ArrowRight", TWO),
    ).toEqual({
      section: 0,
      index: 0,
    });
    expect(
      nextCustomizerFocus({ section: 1, index: 0 }, "ArrowLeft", TWO),
    ).toEqual({
      section: 1,
      index: 11,
    });
  });

  it("↓ steps to the next ROW within a multi-row section before crossing", () => {
    // icon row 0 col 2 → icon row 1 col 2 (index 2 → 8), SAME section
    expect(
      nextCustomizerFocus({ section: 1, index: 2 }, "ArrowDown", TWO),
    ).toEqual({
      section: 1,
      index: 8,
    });
    // icon row 1 (last) → cross DOWN wraps to the color row, same column
    expect(
      nextCustomizerFocus({ section: 1, index: 8 }, "ArrowDown", TWO),
    ).toEqual({
      section: 0,
      index: 2,
    });
  });

  it("↑ steps up a row within a section, then crosses to the previous section's last row", () => {
    // icon row 1 col 3 (index 9) → icon row 0 col 3 (index 3), SAME section
    expect(
      nextCustomizerFocus({ section: 1, index: 9 }, "ArrowUp", TWO),
    ).toEqual({
      section: 1,
      index: 3,
    });
    // icon row 0 col 3 → cross UP to the color row (its only/last row), col 3
    expect(
      nextCustomizerFocus({ section: 1, index: 3 }, "ArrowUp", TWO),
    ).toEqual({
      section: 0,
      index: 3,
    });
  });

  it("single-row color section crosses immediately on ↓ (no 2nd row)", () => {
    // color row col 4 → icon section row 0 col 4
    expect(
      nextCustomizerFocus({ section: 0, index: 4 }, "ArrowDown", TWO),
    ).toEqual({
      section: 1,
      index: 4,
    });
  });

  it("clamps the column when the destination row is shorter", () => {
    // icon grid 10 items (row 1 has 4): row 0 col 5 (index 5) ↓ → clamp to last (9)
    const short: GridSection[] = [
      { count: 8, cols: 8 },
      { count: 10, cols: 6 },
    ];
    expect(
      nextCustomizerFocus({ section: 1, index: 5 }, "ArrowDown", short),
    ).toEqual({
      section: 1,
      index: 9,
    });
  });

  it("skips an empty color section on ↑/↓ (icon-only possessions)", () => {
    const iconOnly: GridSection[] = [
      { count: 0, cols: 8 },
      { count: 12, cols: 6 },
    ];
    // from icon row 0 col 4, ↑ would cross to the empty color section → skip → stay
    expect(
      nextCustomizerFocus({ section: 1, index: 4 }, "ArrowUp", iconOnly),
    ).toEqual({
      section: 1,
      index: 4,
    });
  });

  it("no-ops on a single empty section", () => {
    const pos: GridPos = { section: 0, index: 0 };
    expect(
      nextCustomizerFocus(pos, "ArrowRight", [{ count: 0, cols: 8 }]),
    ).toEqual(pos);
  });
});
