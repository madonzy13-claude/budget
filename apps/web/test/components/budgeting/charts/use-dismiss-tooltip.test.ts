/**
 * use-dismiss-tooltip.test.ts — tapping the tooltip must dismiss BOTH the content
 * AND the recharts cursor line / activeDot (r30 item 1: "same as click outside").
 * The hook exposes `hideCursor` while a point stays dismissed; area/line charts
 * feed it into <Tooltip cursor> + <Area/Line activeDot> so the marker disappears too.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissTooltip } from "@/components/budgeting/charts/use-dismiss-tooltip";

describe("useDismissTooltip", () => {
  it("hides the cursor while a point is dismissed, and restores it on move/leave", () => {
    const { result } = renderHook(() => useDismissTooltip());

    // nothing dismissed yet → cursor + dot render as usual
    expect(result.current.hideCursor).toBe(false);
    expect(result.current.contentExtra.suppressedLabel).toBeNull();

    // tap the tooltip for label "d" → content suppressed AND cursor hidden
    act(() => result.current.contentExtra.onDismiss("d"));
    expect(result.current.contentExtra.suppressedLabel).toBe("d");
    expect(result.current.hideCursor).toBe(true);

    // hovering the SAME point keeps it dismissed (no flicker back)
    act(() => result.current.chartProps.onMouseMove({ activeLabel: "d" }));
    expect(result.current.hideCursor).toBe(true);

    // moving to a DIFFERENT point un-dismisses → cursor returns
    act(() => result.current.chartProps.onMouseMove({ activeLabel: "e" }));
    expect(result.current.hideCursor).toBe(false);
    expect(result.current.contentExtra.suppressedLabel).toBeNull();

    // dismiss again, then leaving the chart also restores the cursor
    act(() => result.current.contentExtra.onDismiss("e"));
    expect(result.current.hideCursor).toBe(true);
    act(() => result.current.chartProps.onMouseLeave());
    expect(result.current.hideCursor).toBe(false);
  });
});
