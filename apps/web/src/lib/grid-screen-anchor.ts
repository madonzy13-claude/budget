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
 * Whether the grid should hold a vertical overscroll or hand it to the page.
 *
 * A touch gesture locks its scroll chain at touchstart, which is why the bug
 * reads the way it does: "scroll down and up without lifting my finger works
 * nice, but once I scroll down and lift my finger I cannot scroll up" (user,
 * 261004). One unbroken drag keeps driving whatever it began on. Lift, and the
 * next touch re-resolves onto the grid — which sits at its own top, has
 * nothing left to give upward, and under `overscroll-behavior: none` hands
 * nothing on either. The page stays where it is, for good.
 *
 * `auto` chains only at the edge, which is the behaviour actually wanted.
 *
 * It is kept as `none` in the BROWSER while the grid has rows of its own:
 * there, Safari's native pull-to-refresh fires on a downward swipe at the top
 * of the page and chaining would feed it. The installed app has no such
 * gesture — its pull-to-refresh is the app's own, gated separately by
 * `data-no-pull-refresh` — so it can chain freely.
 */
export function gridOverscrollY(
  canScrollYPx: number,
  isStandalone: boolean,
): "none" | "auto" {
  if (isStandalone) return "auto";
  return canScrollYPx >= 1 ? "none" : "auto";
}
