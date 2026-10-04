/**
 * grid-screen-anchor.ts — SHELL-R17
 *
 * Pure, DOM-free gate function that computes the iOS-browser-only extension
 * needed to stretch the spendings grid box from 100lvh to the physical screen
 * bottom (eliminating the bare black strip in 754..844 on iPhone).
 *
 * Gate: returns 0 unless `isIOS && isCoarsePointer`.
 * Clamp: [0, 140] — caps blast radius even if a future caller passes bad inputs.
 *
 * Desktop / Android / Chromium e2e: extension == 0 → box + spacer identical
 * to R16. PWA standalone: lvh == screen → delta == 0 → frozen.
 */

export interface ScreenAnchorInput {
  /** Portrait long-edge in CSS px (resolved by caller from screen.height/screen.width). */
  screenH: number;
  /** Measured 100lvh height in CSS px (one-shot probe inside the effect). */
  lvhPx: number;
  /** matchMedia('(pointer: coarse)').matches */
  isCoarsePointer: boolean;
  /** True only for genuine iPhone/iPad (platform check + iPadOS-13+ UA tell). */
  isIOS: boolean;
}

const MAX_EXTENSION = 140;

/**
 * Returns the number of CSS px by which the grid box must be extended past
 * 100lvh to reach the physical screen bottom on iOS Safari browser mode.
 *
 * Returns 0 for desktop, Android, Chromium, PWA standalone, and any device
 * where lvhPx already equals screenH (bar collapsed / standalone).
 */
export function computeScreenExtension(i: ScreenAnchorInput): number {
  // GATE — desktop / Android / Chromium: never touch the box formula.
  if (!i.isIOS || !i.isCoarsePointer) return 0;

  const delta = i.screenH - i.lvhPx; // lvh→screen gap in CSS px

  // Guard: bad inputs (NaN, Infinity from an orientation-swap race, etc.).
  if (!Number.isFinite(delta)) return 0;

  // Clamp to [0, MAX_EXTENSION]. Negative delta (probe failure) → 0.
  // Super-large delta (pathological device) → 140 (max safe extension).
  return Math.min(MAX_EXTENSION, Math.max(0, Math.round(delta)));
}

/**
 * How far the grid sits from the top of the PAGE.
 *
 * `getBoundingClientRect().top` is measured against the viewport, so it shrinks
 * as the page scrolls. The grid's height is `100lvh − top`, which means a
 * scrolled page rebuilt the grid taller by exactly the amount scrolled — the
 * document stayed taller than the viewport, so the page stayed scrolled, and
 * the next measurement grew it again. A loop that feeds itself.
 *
 * It trapped the user because the grid sets `overscroll-behavior: none` and
 * covers everything below the band: a swipe over it never chains to the page,
 * and its own content was too short to scroll. There was nothing left to drag
 * the page back up with, and only relaunching the app (a fresh measurement at
 * scroll 0) recovered it (user, 261004).
 *
 * Adding the scroll offset back makes this a PAGE coordinate: `top + height`
 * equals the viewport however the page happens to be scrolled, so the document
 * never outgrows the viewport and the trap cannot form.
 */
export function gridTopOffset(i: {
  /** getBoundingClientRect().top of the scroller. */
  rectTop: number;
  /** scrollTop of whichever ancestor actually scrolls (window or the shell). */
  scrollTop: number;
}): number {
  return Math.max(0, Math.round(i.rectTop + i.scrollTop));
}

/**
 * Whether the grid should hold a vertical overscroll or pass it to the page.
 *
 * `overscroll-behavior: none` exists so a vertical or diagonal swipe inside the
 * grid cannot bleed into the page and fire pull-to-refresh. That is only worth
 * protecting while the grid HAS scroll of its own. Measured on a column with no
 * transactions, `scrollHeight − clientHeight` is 0 and the box still refused to
 * chain: with the page scrolled down, every touch landed on the grid, the grid
 * did nothing with it and passed nothing on, and the only way back was to
 * relaunch the app (user, 261004).
 */
export function gridOverscrollY(canScrollYPx: number): "none" | "auto" {
  return canScrollYPx >= 1 ? "none" : "auto";
}
