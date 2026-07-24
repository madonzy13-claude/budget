import { describe, it, expect } from "vitest";
import { nextCustomizerFocus, type GridPos } from "@/lib/customizer-nav";

// color row = 8 swatches, icon grid = 12 icons.
const TWO = [8, 12];

describe("customizer-nav", () => {
  it("steps within a section on ←/→, wrapping", () => {
    expect(nextCustomizerFocus({ section: 0, index: 0 }, "ArrowRight", TWO)).toEqual({
      section: 0,
      index: 1,
    });
    // wrap at the end of the color row
    expect(nextCustomizerFocus({ section: 0, index: 7 }, "ArrowRight", TWO)).toEqual({
      section: 0,
      index: 0,
    });
    // wrap backwards from the start
    expect(nextCustomizerFocus({ section: 1, index: 0 }, "ArrowLeft", TWO)).toEqual({
      section: 1,
      index: 11,
    });
  });

  it("jumps between sections on ↑/↓, wrapping and clamping the column", () => {
    // color → icon keeps the column
    expect(nextCustomizerFocus({ section: 0, index: 3 }, "ArrowDown", TWO)).toEqual({
      section: 1,
      index: 3,
    });
    // icon(col 11) → color clamps to the color row's last swatch (7)
    expect(nextCustomizerFocus({ section: 1, index: 11 }, "ArrowUp", TWO)).toEqual({
      section: 0,
      index: 7,
    });
    // ArrowDown from the last section wraps to the first
    expect(nextCustomizerFocus({ section: 1, index: 2 }, "ArrowDown", TWO)).toEqual({
      section: 0,
      index: 2,
    });
  });

  it("skips empty sections on ↑/↓ (icon-only possessions)", () => {
    // color section hidden (0 items) → ↑/↓ stay on the icon section
    const iconOnly = [0, 12];
    expect(nextCustomizerFocus({ section: 1, index: 4 }, "ArrowUp", iconOnly)).toEqual({
      section: 1,
      index: 4,
    });
  });

  it("no-ops on a single empty section", () => {
    const pos: GridPos = { section: 0, index: 0 };
    expect(nextCustomizerFocus(pos, "ArrowRight", [0])).toEqual(pos);
  });
});
