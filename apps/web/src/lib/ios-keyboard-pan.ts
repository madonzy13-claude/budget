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

/** Keyboard height (px) = how much the software keyboard shrinks the visual
 *  viewport below the layout viewport. 0 (clamped) when the keyboard is closed. */
export function keyboardInset(innerHeight: number, vvHeight: number): number {
  return Math.max(0, Math.round(innerHeight - vvHeight));
}

/**
 * useIosShellKeyboardFit — hold a focused field perfectly still while the iOS
 * standalone keyboard opens, killing the first-open "slide".
 *
 * Video montage of the first-open (R26): with `main` padded scrollable, iOS
 * ANIMATED-SCROLLS `main` on focus (the app header scrolls off the top, the
 * field jams high) — that scroll is the slide. Because it is a `main` scroll and
 * not a visual-viewport pan, `main.scrollTop` can counter it every frame. So we
 * pad `main` scrollable, then clamp the field to a FIXED target on each
 * animation frame for ~600ms, overriding iOS's scroll so nothing visibly moves.
 * The field settles centred above the keyboard; padding removed on blur/unmount.
 *
 * Standalone-only: Safari repositions the field inside its own resizing layout
 * viewport, so there is nothing to correct there.
 */
export function useIosShellKeyboardFit(
  inputRef: React.RefObject<HTMLElement | null>,
): void {
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    if (!standalone) return;
    const main = document.querySelector<HTMLElement>("main[data-shell-scroll]");
    if (!main) return;

    // Video montage of the first-open (R26): with `main` padded scrollable, iOS
    // ANIMATED-SCROLLS main on focus (header scrolls off the top → the field
    // jams high) — that scroll IS the slide. Because it is a main scroll (not a
    // viewport pan), main.scrollTop can counter it frame-by-frame. So: pad main
    // (scrollable), then for ~600ms after focus CLAMP the field to a fixed
    // target every animation frame, overriding iOS's scroll so nothing visibly
    // moves. Hardcoded keyboard height for now (reporter's 401); once proven this
    // becomes a per-device value cached in localStorage.
    const ASSUMED_KB_PX = 401;
    const HOLD_MS = 600;

    let active = false;
    let raf = 0;
    const clear = () => main.style.removeProperty("padding-bottom");
    const onFocus = () => {
      active = true;
      // Pad main so it is scrollable (else iOS pans the viewport, which
      // main.scrollTop cannot counter).
      main.style.paddingBottom = `${ASSUMED_KB_PX}px`;
      // Fixed target: centre of the strip that will be visible above the
      // keyboard. FIXED (not tracking vv.height as it ramps) so the field is
      // held perfectly still through the whole open animation.
      const target = Math.round((window.innerHeight - ASSUMED_KB_PX) / 2);
      const start = performance.now();
      const hold = () => {
        if (!active) {
          raf = 0;
          return;
        }
        const delta = el.getBoundingClientRect().top - target;
        // Only correct real drift; sub-pixel noise would thrash scrollTop.
        if (Math.abs(delta) > 1) main.scrollTop += delta;
        raf =
          performance.now() - start < HOLD_MS ? requestAnimationFrame(hold) : 0;
      };
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(hold);
    };
    const onBlur = () => {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clear();
    };

    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    if (document.activeElement === el) onFocus();
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, [inputRef]);
}
