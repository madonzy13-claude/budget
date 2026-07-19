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
import { useEffect, type RefObject } from "react";

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
 * Attach the first-keyboard-open window-pan correction to ONE standalone text
 * input — the wizard budget-name and the investment asset-name search, which are
 * NOT wrapped in InlineEditCell (that component has this built in). While the input
 * holds focus, a visualViewport resize/scroll scrolls the WINDOW so the input stays
 * inside the visual viewport, fixing iOS standalone's first-open overshoot. No-op
 * off iOS (no visualViewport) and whenever the input is already visible.
 */
export function useIosKeyboardPanFix(
  inputRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const correctNow = () => {
      const input = inputRef.current;
      if (!input || document.activeElement !== input) return;
      const rect = input.getBoundingClientRect();
      const delta = windowPanCorrection({
        inputTop: rect.top,
        inputBottom: rect.bottom,
        vvOffsetTop: vv.offsetTop,
        vvHeight: vv.height,
      });
      // instant, not the page's scroll-behavior: a smooth/animated scroll here
      // reads as the input SLIDING up the screen.
      if (delta !== 0)
        window.scrollBy({ top: delta, left: 0, behavior: "instant" });
    };
    // DEBOUNCE to a SINGLE correction after the viewport settles. Correcting on
    // every intermediate vv event during the keyboard-open animation scrolled the
    // window frame-by-frame — a visible bottom-to-top slide. One reposition once
    // the keyboard has finished animating is all that's needed.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(correctNow, 250);
    };
    // Only the input's own focus arms it (the keyboard is for THIS field); the
    // vv resize that follows the keyboard open re-arms so we fire after it settles.
    const onFocusIn = (e: FocusEvent) => {
      if (e.target === inputRef.current) schedule();
    };
    vv.addEventListener("resize", schedule);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      vv.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", onFocusIn);
      if (timer) clearTimeout(timer);
    };
  }, [inputRef]);
}
