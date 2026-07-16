/**
 * keyboard-scroll.ts — clamped scroll delta that keeps an inline editor input
 * visible above the iOS keyboard WITHOUT pushing it past the visible top.
 *
 * delta = how far the scroll container should scroll DOWN (scrollTop +=) so the
 * input's bottom clears the keyboard. Clamped to the input's headroom — the
 * distance its top can travel up while staying inside the visible area — so
 * repeated calls converge and the row never scrolls out of sight.
 */
/** Fraction of the viewport the iOS keyboard can never reach (top zone). */
const SAFE_LINE = 0.45;
/** Where a pre-scrolled row's top should land (fraction of viewport height). */
const TARGET_LINE = 0.3;

/**
 * Pre-focus positioning (iOS standalone). PWA mode gets iOS's buggy
 * reveal-scroll on focus — preventScroll doesn't suppress it and no
 * visualViewport resize fires afterwards to correct against. So the container
 * is positioned BEFORE focus and then held: a row whose bottom is above the
 * 45% line needs NO scroll (no iPhone keyboard reaches that high); a lower row
 * is scrolled once so its top lands at 30% of the viewport, safely above any
 * keyboard. Returns the scrollTop delta to apply before focusing.
 */
export function editScrollDelta(box: {
  inputTop: number;
  inputBottom: number;
  viewportHeight: number;
}): number {
  if (box.inputBottom <= box.viewportHeight * SAFE_LINE) return 0;
  return box.inputTop - Math.round(box.viewportHeight * TARGET_LINE);
}

export function keyboardScrollDelta(box: {
  inputTop: number;
  inputBottom: number;
  visibleTop: number;
  visibleBottom: number;
  padding?: number;
}): number {
  const pad = box.padding ?? 24;
  // Above the visible top (iOS's async keyboard reveal-scroll overshot):
  // negative delta scrolls back up until the input top re-enters the view.
  const underflow = box.inputTop - (box.visibleTop + pad);
  if (underflow < 0) return underflow;
  // Below the keyboard: scroll down, clamped to the input's headroom so the
  // row can never leave through the top.
  const overflow = box.inputBottom - (box.visibleBottom - pad);
  if (overflow <= 0) return 0;
  return Math.min(overflow, underflow);
}
