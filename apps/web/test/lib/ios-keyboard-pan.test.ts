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
  keyboardInset,
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

describe("keyboardInset", () => {
  it("returns the keyboard height when the viewport is shrunk", () => {
    // IMG_3240 geometry: innerH 874, vvH 473 → keyboard ≈ 401.
    expect(keyboardInset(874, 473)).toBe(401);
  });

  it("clamps to 0 (never negative) when the visual viewport is not smaller", () => {
    expect(keyboardInset(874, 874)).toBe(0);
    expect(keyboardInset(874, 880)).toBe(0);
  });
});
