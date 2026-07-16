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
  const overflow = box.inputBottom - (box.visibleBottom - pad);
  if (overflow <= 0) return 0;
  const headroom = Math.max(0, box.inputTop - (box.visibleTop + pad));
  return Math.min(overflow, headroom);
}
