import * as React from "react";

/**
 * ios-keyboard-pan.ts — correction for iOS standalone's first-keyboard-open
 * window-pan overshoot.
 *
 * vpdbg evidence (2026-07-16): opening the keyboard in PWA mode pans the
 * WINDOW (winY/seTop) — <main> keeps its scrollTop. On the FIRST open after
 * app launch the pan overshoots several-fold (keyboard height not yet
 * cached), shoving the focused row under the status bar; every later open
 * pans correctly. This computes the window.scrollBy(0, delta) that brings the
 * input back inside the visual viewport — 0 when it is already visible, so
 * Safari and the well-behaved second open are untouched.
 *
 * Coordinates: inputTop/inputBottom from getBoundingClientRect (layout
 * viewport — they shift with window scroll, not with the vv pan);
 * vvOffsetTop/vvHeight from window.visualViewport.
 */
export function windowPanCorrection(box: {
  inputTop: number;
  inputBottom: number;
  vvOffsetTop: number;
  vvHeight: number;
  padding?: number;
}): number {
  const pad = box.padding ?? 16;
  const visualTop = box.inputTop - box.vvOffsetTop;
  const visualBottom = box.inputBottom - box.vvOffsetTop;
  // Above the visual viewport (the overshoot): scroll the window back up.
  if (visualTop < pad) return visualTop - pad;
  // Hidden under the keyboard: scroll down, but never push the input's top
  // out through the top of the view.
  const overlap = visualBottom - (box.vvHeight - pad);
  if (overlap > 0) return Math.min(overlap, visualTop - pad);
  return 0;
}

/**
 * useIosShellKeyboardFit — cancels iOS standalone's keyboard-open WINDOW pan
 * while `inputRef` is focused, so the shell never slides up under the status bar
 * (and never uncovers the black band below the shrunk layout).
 *
 * On-device vpdbg (R22) proved the fields we attach this to are top-anchored
 * block flow — the focused input naturally sits ABOVE the keyboard (top 422 <
 * vvH 473) with NO layout change. So the only defect is iOS panning the window
 * to give the field extra margin (the first-open overshoot). We just reset the
 * window to the top; nothing is resized, so there is no reflow slide and no
 * exposed gap. Idempotent — a no-op once winY is already 0, so the scroll
 * listener our own reset would re-fire can't loop.
 *
 * Standalone-only: Safari repositions the field inside its own resizing layout
 * viewport, so there is nothing to cancel there.
 */
export function useIosShellKeyboardFit(
  inputRef: React.RefObject<HTMLElement | null>,
): void {
  React.useEffect(() => {
    const el = inputRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!el || !vv) return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    if (!standalone) return;

    let active = false;
    const pin = () => {
      if (!active) return;
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const onFocus = () => {
      active = true;
      pin();
    };
    const onBlur = () => {
      active = false;
    };

    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    vv.addEventListener("resize", pin);
    vv.addEventListener("scroll", pin);
    if (document.activeElement === el) onFocus();
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      vv.removeEventListener("resize", pin);
      vv.removeEventListener("scroll", pin);
    };
  }, [inputRef]);
}
