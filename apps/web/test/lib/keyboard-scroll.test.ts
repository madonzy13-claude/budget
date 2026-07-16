/**
 * keyboard-scroll.test.ts — clamp math for the inline-editor keyboard nudge.
 *
 * Regression: the first fix scrolled by the full keyboard overlap with no
 * headroom cap, so the edited wallet row shot past the visible top — the user
 * couldn't see what they were editing. The delta must never push the input's
 * top above the visible area.
 */
import { describe, it, expect } from "vitest";
import { keyboardScrollDelta } from "../../src/lib/keyboard-scroll";

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
