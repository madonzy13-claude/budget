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

/** Below this the gap is address-bar wobble / rounding, not a keyboard. */
const KEYBOARD_MIN_PX = 120;

/**
 * useIosShellKeyboardFit — while `inputRef` is focused in an installed PWA, give
 * the shell scroller (`main[data-shell-scroll]`) bottom padding equal to the
 * keyboard height so it becomes SCROLLABLE.
 *
 * On-device vpdbg (R23, IMG_3238–3240): the keyboard-open "slide from the
 * bottom" is iOS PANNING THE VISUAL VIEWPORT (winY stays 0 the whole time — it
 * is not a window scroll, which is why window.scrollTo could never fix it). iOS
 * pans because `main` is exactly as tall as its content (747/747) — nothing is
 * scrollable, so to keep the focused field clear of the keyboard iOS shifts the
 * whole viewport, then settles. Making `main` scrollable gives iOS a container
 * to scroll instead: it nudges `main` (smooth, header stays put) or, since the
 * field already sits above the keyboard, does nothing at all — either way no
 * viewport pan, no slide. Padding is removed on blur/unmount.
 *
 * Standalone-only: Safari repositions the field inside its own resizing layout
 * viewport, so there is nothing to correct there.
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
    const main = document.querySelector<HTMLElement>("main[data-shell-scroll]");
    if (!main) return;

    let active = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => main.style.removeProperty("padding-bottom");
    // Once the keyboard has settled, place the field ourselves. main is now
    // scrollable and the window has no scroll range, so scrollIntoView moves
    // ONLY main — centring the field in the visible strip instead of letting
    // iOS's focus-scroll jam it against the status bar (the "too high").
    const centre = () => {
      if (!active) return;
      el.scrollIntoView({ block: "center", behavior: "auto" });
    };
    const apply = () => {
      if (!active) return;
      const kb = keyboardInset(window.innerHeight, vv.height);
      if (kb > KEYBOARD_MIN_PX) {
        main.style.paddingBottom = `${kb}px`;
      } else {
        clear();
      }
      // Debounce so we centre once after the open animation, not every frame.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(centre, 150);
    };
    const onFocus = () => {
      active = true;
      // The keyboard has not opened yet at focus time (vv.height ≈ innerHeight),
      // so seed a generous inset immediately — the container must already be
      // scrollable when iOS processes the focus, or iOS commits to panning the
      // viewport before our resize handler runs. The resize below tightens it to
      // the real keyboard height.
      main.style.paddingBottom = `${Math.round(window.innerHeight * 0.5)}px`;
    };
    const onBlur = () => {
      active = false;
      if (settleTimer) clearTimeout(settleTimer);
      clear();
    };

    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    vv.addEventListener("resize", apply);
    if (document.activeElement === el) onFocus();
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      vv.removeEventListener("resize", apply);
      if (settleTimer) clearTimeout(settleTimer);
      clear();
    };
  }, [inputRef]);
}
