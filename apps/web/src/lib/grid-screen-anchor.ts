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
