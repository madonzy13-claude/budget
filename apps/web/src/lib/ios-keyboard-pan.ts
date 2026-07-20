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

/** Min visual/layout height gap (px) that counts as "keyboard open" — above any
 *  address-bar wobble, below the shortest software keyboard. */
const KEYBOARD_GAP_PX = 120;

/**
 * Decide the height (px) to pin the layout chain (`html` + `body` + shell) to
 * while a field is focused, or null to leave them at their stylesheet `100lvh`.
 *
 * The (app) shell locks `html`/`body` to `100lvh` (global.css) and the shell
 * root to `h-lvh`, so the layout viewport is always full-screen tall. On iOS
 * standalone the keyboard shrinks only the VISUAL viewport, so the focused field
 * ends up behind the keyboard in layout terms → iOS pans the whole window to
 * reveal it (the first-open overshoot = the "jump"). Pinning the chain to the
 * visual height removes that gap: the field is inside the layout viewport, iOS
 * has nothing to pan, and the inner `<main>` scroller handles the reveal on its
 * own. Restore (null) closes the keyboard.
 */
export function shellFitHeight(
  innerHeight: number,
  vvHeight: number,
): number | null {
  return innerHeight - vvHeight > KEYBOARD_GAP_PX ? vvHeight : null;
}

/**
 * useIosShellKeyboardFit — pins `html` to the visual-viewport height while
 * `inputRef` is focused in an installed PWA, so opening the keyboard never pans
 * the window (no jump) and needs no counter-scroll (no slide). Scoped to the one
 * field: it only touches the shell while that field holds focus and always
 * restores on blur/unmount, so blast radius is "typing in this input" and the
 * documented `100lvh` shell geometry is untouched everywhere else.
 *
 * Standalone-only: Safari resizes its own layout viewport on keyboard open, so
 * `100lvh` already tracks the keyboard there and there is nothing to correct.
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

    const html = document.documentElement;
    const body = document.body;
    const shell = document.querySelector<HTMLElement>("[data-shell-root]");
    let active = false;
    const restore = () => {
      html.style.removeProperty("height");
      body.style.removeProperty("height");
      shell?.style.removeProperty("height");
    };
    const fit = () => {
      if (!active) return;
      const h = shellFitHeight(window.innerHeight, vv.height);
      if (h == null) {
        restore();
        return;
      }
      const px = `${h}px`;
      // Shrink the WHOLE layout chain to the visible height: html + body (the
      // scroll root, both 100lvh in standalone) AND the h-lvh shell container.
      // Pinning html alone leaves body + shell full-height, so the document
      // keeps its scroll range and iOS still pans (the jump). With all three at
      // the visual height there is no pan range, and the inner <main> shrinks so
      // it can lift the field above the keyboard on its own.
      html.style.height = px;
      body.style.height = px;
      if (shell) shell.style.height = px;
      // Undo any pan iOS already applied before we removed the scroll range —
      // now that html/body have no range this sticks and iOS can't re-pan.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      el.scrollIntoView({ block: "center", behavior: "auto" });
    };
    const onFocus = () => {
      active = true;
      fit();
    };
    const onBlur = () => {
      active = false;
      restore();
    };

    el.addEventListener("focus", onFocus);
    el.addEventListener("blur", onBlur);
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    if (document.activeElement === el) onFocus();
    return () => {
      el.removeEventListener("focus", onFocus);
      el.removeEventListener("blur", onBlur);
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      restore();
    };
  }, [inputRef]);
}
