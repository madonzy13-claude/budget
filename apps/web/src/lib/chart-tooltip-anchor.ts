/**
 * chart-tooltip-anchor.ts — keeping an anchored tooltip inside its plot.
 *
 * Anchoring the box to the hovered point puts its LEFT edge at that point, so
 * a point near the right-hand end of the series pushes the tooltip off the
 * screen — the month label and every amount with it (user, 261016).
 */

/** Widest a tooltip is allowed to be; mirrors chart-tooltip.tsx's own cap. */
export const TOOLTIP_MAX_PX = 280;

/**
 * Where the tooltip's left edge may sit, given the plot's width.
 *
 * `plotWidth` of 0 means "not measured yet" — leave the anchor alone rather
 * than slamming it to the left for one frame.
 */
export function clampAnchorX(
  x: number,
  plotWidth: number,
  tooltipWidth: number,
): number {
  if (plotWidth <= 0) return x;
  const room = plotWidth - tooltipWidth;
  // A box wider than the plot has nowhere to be but the left edge; the width
  // cap in chart-tooltip.tsx keeps it on screen from there.
  if (room <= 0) return 0;
  return Math.max(0, Math.min(x, room));
}
