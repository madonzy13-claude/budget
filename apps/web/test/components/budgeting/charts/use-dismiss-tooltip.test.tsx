/**
 * use-dismiss-tooltip.test.tsx — two things the charts owe a reader on a
 * phone (user, 261016).
 *
 * ANCHOR. The tooltip has to sit just under the point it describes — ten
 * pixels below the dot, not parked at the bottom of the plot, and not over
 * the chart. recharts only honours `position` when it carries x AND y, so the
 * hook tracks the active coordinate and hands back a ready anchor.
 *
 * EXCLUSIVITY. "Only one tooltip can be open": opening one on any chart has to
 * close whatever is open on the others, and tapping the open one closes it.
 * Charts do not know about each other, so they agree through a window event —
 * the same pattern the spendings rows use for single-reveal.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissTooltip } from "@/components/budgeting/charts/use-dismiss-tooltip";

describe("useDismissTooltip — anchoring", () => {
  it("has no anchor before anything is active", () => {
    const { result } = renderHook(() => useDismissTooltip());
    expect(result.current.anchor).toBeNull();
  });

  it("anchors ten pixels below the active point", () => {
    const { result } = renderHook(() => useDismissTooltip());
    act(() => {
      result.current.chartProps.onMouseMove({
        activeLabel: "2027-01",
        activeCoordinate: { x: 120, y: 64 },
      });
    });
    expect(result.current.anchor).toEqual({ x: 120, y: 74 });
  });

  it("drops the anchor when the pointer leaves", () => {
    const { result } = renderHook(() => useDismissTooltip());
    act(() => {
      result.current.chartProps.onMouseMove({
        activeLabel: "2027-01",
        activeCoordinate: { x: 10, y: 10 },
      });
    });
    act(() => result.current.chartProps.onMouseLeave());
    expect(result.current.anchor).toBeNull();
  });
});

describe("useDismissTooltip — only one open at a time", () => {
  beforeEach(() => {
    // Each hook instance gets its own id; nothing to reset but the listeners,
    // which unmount with their hooks.
  });

  it("closes when another chart opens one", () => {
    const a = renderHook(() => useDismissTooltip());
    act(() => {
      a.result.current.chartProps.onMouseMove({
        activeLabel: "jan",
        activeCoordinate: { x: 1, y: 1 },
      });
    });
    expect(a.result.current.contentExtra.suppressedLabel).toBeNull();

    // A second chart opens its own tooltip.
    const b = renderHook(() => useDismissTooltip());
    act(() => {
      b.result.current.chartProps.onMouseMove({
        activeLabel: "feb",
        activeCoordinate: { x: 2, y: 2 },
      });
    });

    expect(a.result.current.contentExtra.suppressedLabel).toBe("jan");
    expect(b.result.current.contentExtra.suppressedLabel).toBeNull();
  });

  it("does not close itself when it is the one opening", () => {
    const { result } = renderHook(() => useDismissTooltip());
    act(() => {
      result.current.chartProps.onMouseMove({
        activeLabel: "mar",
        activeCoordinate: { x: 3, y: 3 },
      });
    });
    expect(result.current.contentExtra.suppressedLabel).toBeNull();
  });

  it("still closes on a tap of its own tooltip", () => {
    const { result } = renderHook(() => useDismissTooltip());
    act(() => {
      result.current.chartProps.onMouseMove({
        activeLabel: "apr",
        activeCoordinate: { x: 4, y: 4 },
      });
    });
    act(() => result.current.contentExtra.onDismiss("apr"));
    expect(result.current.contentExtra.suppressedLabel).toBe("apr");
    expect(result.current.hideCursor).toBe(true);
  });
});
