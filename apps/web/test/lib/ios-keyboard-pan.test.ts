/**
 * ios-keyboard-pan.test.ts — window-pan correction for the iOS standalone
 * first-keyboard-open overshoot.
 *
 * vpdbg evidence (2026-07-16 recording): on the FIRST keyboard open after app
 * launch iOS pans the WINDOW (winY/seTop — <main> stays at scrollTop 0) several
 * times too far, shoving the edited row under the status bar; the second open
 * pans correctly (winY 59). The correction must scroll the WINDOW back —
 * never <main> — and only when the input actually sits outside the visual
 * viewport.
 */
import { describe, it, expect } from "vitest";
import {
  windowPanCorrection,
  shellFitHeight,
} from "../../src/lib/ios-keyboard-pan";

describe("windowPanCorrection", () => {
  it("returns 0 when the input is visible inside the visual viewport", () => {
    // Second-tap geometry from the recording: rect 239, vvOff 59, vvH 515.
    expect(
      windowPanCorrection({
        inputTop: 239,
        inputBottom: 275,
        vvOffsetTop: 59,
        vvHeight: 515,
      }),
    ).toBe(0);
  });

  it("scrolls the window UP (negative) when the overshoot pushed the input above the view", () => {
    // First-tap geometry: overshoot left the input's visual top near the
    // status bar / above the vv top.
    const d = windowPanCorrection({
      inputTop: 97,
      inputBottom: 133,
      vvOffsetTop: 120,
      vvHeight: 515,
      padding: 16,
    });
    // visualTop = 97-120 = -23 → scroll window by -23-16 = -39.
    expect(d).toBe(-39);
  });

  it("scrolls the window DOWN (positive) when the input hides under the keyboard", () => {
    const d = windowPanCorrection({
      inputTop: 700,
      inputBottom: 736,
      vvOffsetTop: 0,
      vvHeight: 515,
      padding: 16,
    });
    // visualBottom = 736 → overlap = 736-(515-16) = 237; headroom = 700-16.
    expect(d).toBe(237);
  });

  it("clamps the downward correction so the input top never leaves the view", () => {
    const d = windowPanCorrection({
      inputTop: 30,
      inputBottom: 600,
      vvOffsetTop: 0,
      vvHeight: 515,
      padding: 16,
    });
    // Tall input: full overlap would push its top negative — clamp to top-14.
    expect(d).toBe(30 - 16);
  });
});

describe("shellFitHeight", () => {
  it("pins the layout viewport to the visual height when the keyboard is open", () => {
    // Keyboard shrinks the visual viewport well below the layout viewport.
    expect(shellFitHeight(844, 508)).toBe(508);
  });

  it("returns null (restore lvh) when no keyboard — heights are close", () => {
    // Address-bar wobble / rounding: a small gap is NOT the keyboard.
    expect(shellFitHeight(844, 838)).toBeNull();
  });

  it("returns null exactly at the threshold boundary", () => {
    // 120px gap is the floor; must be strictly greater to count as keyboard.
    expect(shellFitHeight(844, 844 - 120)).toBeNull();
  });
});
