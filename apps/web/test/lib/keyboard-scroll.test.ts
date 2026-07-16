/**
 * keyboard-scroll.test.ts — clamp math for the inline-editor keyboard nudge.
 *
 * Regression: the first fix scrolled by the full keyboard overlap with no
 * headroom cap, so the edited wallet row shot past the visible top — the user
 * couldn't see what they were editing. The delta must never push the input's
 * top above the visible area.
 */
import { describe, it, expect } from "vitest";
import {
  keyboardScrollDelta,
  editScrollDelta,
} from "../../src/lib/keyboard-scroll";

describe("keyboardScrollDelta", () => {
  it("returns 0 when the input is already fully visible", () => {
    expect(
      keyboardScrollDelta({
        inputTop: 100,
        inputBottom: 140,
        visibleTop: 0,
        visibleBottom: 400,
      }),
    ).toBe(0);
  });

  it("scrolls by the keyboard overlap when there is plenty of headroom", () => {
    // Input bottom 60px past the visible bottom (minus padding) → scroll 60+pad.
    const d = keyboardScrollDelta({
      inputTop: 500,
      inputBottom: 540,
      visibleTop: 0,
      visibleBottom: 504,
      padding: 24,
    });
    expect(d).toBe(540 - (504 - 24)); // 60
  });

  it("clamps to headroom so the input top never leaves the visible area", () => {
    // Input sits near the visible top: only 26px of headroom above it.
    // Full overlap would be 300 — must clamp to 26 - padding... i.e. the
    // distance the input can move up while its top stays below visibleTop+pad.
    const d = keyboardScrollDelta({
      inputTop: 50,
      inputBottom: 90,
      visibleTop: 0,
      visibleBottom: -186, // keyboard ate almost everything
      padding: 24,
    });
    expect(d).toBe(Math.max(0, 50 - (0 + 24))); // 26 — never more
  });

  it("scrolls back UP (negative delta) when the input sits above the visible top", () => {
    // iOS's async keyboard reveal-scroll can overshoot and push the edited row
    // above the viewport — the user sees rows far below what they tapped.
    // The delta must pull the row back down into view.
    const d = keyboardScrollDelta({
      inputTop: -300,
      inputBottom: -260,
      visibleTop: 0,
      visibleBottom: 500,
      padding: 24,
    });
    expect(d).toBe(-300 - 24); // scrollTop += -324 → row lands at visibleTop+pad
  });

  it("returns 0 when the input top merely touches the padded top edge", () => {
    expect(
      keyboardScrollDelta({
        inputTop: 24,
        inputBottom: 64,
        visibleTop: 0,
        visibleBottom: 500,
        padding: 24,
      }),
    ).toBe(0);
  });
});

// Pre-focus positioning: iOS standalone runs its own buggy reveal-scroll on
// focus (preventScroll doesn't cover it, and no visualViewport resize fires in
// PWA mode to correct after). Strategy: decide the target BEFORE focusing —
// rows in the keyboard-safe top zone need NO scroll at all; lower rows get one
// deliberate pre-scroll to a spot no keyboard can cover.
describe("editScrollDelta", () => {
  it("returns 0 for a row in the top half — the keyboard cannot cover it", () => {
    expect(
      editScrollDelta({ inputTop: 300, inputBottom: 340, viewportHeight: 874 }),
    ).toBe(0);
  });

  it("returns 0 for a row right at the top", () => {
    expect(
      editScrollDelta({ inputTop: 0, inputBottom: 40, viewportHeight: 874 }),
    ).toBe(0);
  });

  it("pre-scrolls a bottom-half row up to ~30% of the viewport", () => {
    const d = editScrollDelta({
      inputTop: 700,
      inputBottom: 740,
      viewportHeight: 874,
    });
    expect(d).toBe(700 - Math.round(874 * 0.3));
  });

  it("uses the row bottom against the 45% safe line", () => {
    // Row straddling the line: bottom at 45%+1 → needs the pre-scroll.
    const vh = 800;
    const d = editScrollDelta({
      inputTop: vh * 0.45 - 39,
      inputBottom: vh * 0.45 + 1,
      viewportHeight: vh,
    });
    expect(d).toBe(vh * 0.45 - 39 - Math.round(vh * 0.3));
  });
});
