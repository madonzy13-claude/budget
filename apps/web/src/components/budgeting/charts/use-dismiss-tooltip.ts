"use client";
/**
 * use-dismiss-tooltip.ts — makes an area/line tooltip dismissable by TAPPING it
 * (r28 item 3). recharts shows those tooltips on hover/touch and ignores a
 * controlled `active` prop, and trigger="click" won't hide on a re-tap (an area
 * has no empty spot). So instead we let the tooltip CONTENT hide itself: tapping
 * it records the dismissed x-label and the content returns null for that label;
 * moving/ tapping a different point clears it so the tooltip works again.
 *
 * A dismiss must feel like a click OUTSIDE the chart: not only the tooltip box but
 * also recharts' cursor line + activeDot vanish (r30 item 1). recharts keeps those
 * alive while the pointer stays over the point, so we expose `hideCursor` (true
 * while a point is dismissed) and the chart feeds it into <Tooltip cursor> and the
 * series' `activeDot` to blank both.
 *
 * Spread `chartProps` on the chart, `tooltipProps` on <Tooltip>, and `contentExtra`
 * onto <ChartTooltipContent/>; use `hideCursor` for the cursor/activeDot.
 */
import { useRef, useState } from "react";

type IdxLike = number | string | null | undefined;
const lbl = (raw: IdxLike): string | null => (raw == null ? null : String(raw));

export function useDismissTooltip() {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const ref = useRef<string | null>(null);
  ref.current = dismissed;
  const clearIfMoved = (s: { activeLabel?: IdxLike }) => {
    const l = lbl(s?.activeLabel);
    if (l != null && l !== ref.current) setDismissed(null);
  };
  return {
    // While a point is dismissed, blank the cursor line + activeDot too — a tap
    // should behave like clicking OUTSIDE the chart, not just hide the box.
    hideCursor: dismissed != null,
    chartProps: {
      onMouseMove: clearIfMoved, // moved to another point → un-dismiss
      onMouseLeave: () => setDismissed(null),
    },
    tooltipProps: { wrapperStyle: { pointerEvents: "auto" as const } },
    contentExtra: {
      suppressedLabel: dismissed,
      onDismiss: (l: IdxLike) => setDismissed(lbl(l)),
    },
  };
}
