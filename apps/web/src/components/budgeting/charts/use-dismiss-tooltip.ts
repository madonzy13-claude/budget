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
import { useEffect, useId, useRef, useState } from "react";

/** How far under the hovered point the tooltip's top edge sits. */
const ANCHOR_GAP_PX = 10;

/** Charts do not know about each other, so they agree through the window that
 *  only one tooltip is open — the same single-reveal pattern the spendings
 *  rows use (user, 261016: "only one tooltip can be open"). */
const OPEN_EVENT = "chart-tooltip-open";

/**
 * Join the "only one tooltip open" protocol.
 *
 * Returns `announce`, to call when THIS chart opens one; every other
 * participant is told to close. The bar chart keeps its own activeIndex state
 * rather than this hook's dismissed-label one, so the protocol lives here on
 * its own and both can take part (user, 261016: two tooltips on screen at
 * once, an area chart's and a bar chart's).
 */
export function useCloseOnScroll(close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onScroll = () => closeRef.current();
    // Capture: the shell scroller, the grid, the window — whichever moved.
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, []);
}

export function useTooltipExclusivity(close: () => void) {
  const id = useId();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    function onOther(e: Event) {
      if ((e as CustomEvent<{ id: string }>).detail?.id === id) return;
      closeRef.current();
    }
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [id]);
  return () =>
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }));
}

type IdxLike = number | string | null | undefined;
const lbl = (raw: IdxLike): string | null => (raw == null ? null : String(raw));

export function useDismissTooltip() {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<string | null>(null);
  ref.current = dismissed;
  const id = useId();
  // The label currently under the pointer, so a message from another chart can
  // suppress exactly it.
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    function onOther(e: Event) {
      const who = (e as CustomEvent<{ id: string }>).detail?.id;
      if (who === id) return;
      if (activeRef.current != null) setDismissed(activeRef.current);
    }
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [id]);

  useCloseOnScroll(() => {
    if (activeRef.current != null) setDismissed(activeRef.current);
  });

  const clearIfMoved = (s: {
    activeLabel?: IdxLike;
    activeCoordinate?: { x?: number; y?: number } | null;
  }) => {
    const l = lbl(s?.activeLabel);
    activeRef.current = l;
    const c = s?.activeCoordinate;
    setAnchor(
      typeof c?.x === "number" && typeof c?.y === "number"
        ? { x: c.x, y: c.y + ANCHOR_GAP_PX }
        : null,
    );
    if (l != null && l !== ref.current) {
      setDismissed(null);
      // Opening one closes every other chart's.
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { id } }));
    }
  };
  return {
    /** Where the tooltip should sit: just under the point it describes. */
    anchor,
    // While a point is dismissed, blank the cursor line + activeDot too — a tap
    // should behave like clicking OUTSIDE the chart, not just hide the box.
    hideCursor: dismissed != null,
    chartProps: {
      onMouseMove: clearIfMoved, // moved to another point → un-dismiss
      onMouseLeave: () => {
        activeRef.current = null;
        setAnchor(null);
        setDismissed(null);
      },
    },
    tooltipProps: {
      wrapperStyle: { pointerEvents: "auto" as const },
      // Keep the box inside the chart on both axes. This is recharts' default,
      // but stated here so a future prop spread cannot quietly drop it: the
      // tooltip ran off the right edge of a phone (user, 261016).
      allowEscapeViewBox: { x: false, y: false },
    },
    contentExtra: {
      suppressedLabel: dismissed,
      onDismiss: (l: IdxLike) => setDismissed(lbl(l)),
    },
  };
}
