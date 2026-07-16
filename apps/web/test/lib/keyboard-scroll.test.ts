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

  it("never returns a negative delta", () => {
    expect(
      keyboardScrollDelta({
        inputTop: 10,
        inputBottom: 50,
        visibleTop: 40,
        visibleBottom: 800,
      }),
    ).toBe(0);
  });
});
