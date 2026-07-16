/**
 * keyboard-scroll.ts — clamped scroll delta that keeps an inline editor input
 * visible above the iOS keyboard WITHOUT pushing it past the visible top.
 *
 * delta = how far the scroll container should scroll DOWN (scrollTop +=) so the
 * input's bottom clears the keyboard. Clamped to the input's headroom — the
 * distance its top can travel up while staying inside the visible area — so
 * repeated calls converge and the row never scrolls out of sight.
 */
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
