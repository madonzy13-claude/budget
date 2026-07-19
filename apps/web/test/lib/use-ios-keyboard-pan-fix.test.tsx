/**
 * use-ios-keyboard-pan-fix.test.tsx — the reusable hook wiring the
 * windowPanCorrection to a standalone text input (wizard budget-name, investment
 * asset-name search). Verifies: while the input is focused, a visualViewport
 * resize scrolls the WINDOW by the correction; a no-op when the input isn't
 * focused. The math itself is covered by ios-keyboard-pan.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useIosKeyboardPanFix } from "@/lib/ios-keyboard-pan";

function Harness() {
  const ref = useRef<HTMLInputElement>(null);
  useIosKeyboardPanFix(ref);
  return <input data-testid="inp" ref={ref} />;
}

const rect = (top: number, bottom: number) =>
  ({
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
    x: 0,
    y: 0,
    toJSON: () => {},
  }) as DOMRect;

describe("useIosKeyboardPanFix", () => {
  let vv: EventTarget & { offsetTop: number; height: number };

  beforeEach(() => {
    vi.useFakeTimers();
    vv = Object.assign(new EventTarget(), { offsetTop: 120, height: 515 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: vv,
    });
    window.scrollBy = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it("corrects (instant, debounced) once the viewport settles after a focused overshoot", () => {
    const { getByTestId } = render(<Harness />);
    const inp = getByTestId("inp") as HTMLInputElement;
    inp.getBoundingClientRect = () => rect(97, 133); // visualTop = 97-120 = -23
    inp.focus();
    vv.dispatchEvent(new Event("resize"));
    expect(window.scrollBy).not.toHaveBeenCalled(); // debounced, not fired yet
    vi.advanceTimersByTime(300);
    // visualTop -23 < pad 16 → delta = -23 - 16 = -39, INSTANT (no slide).
    expect(window.scrollBy).toHaveBeenCalledWith({
      top: -39,
      left: 0,
      behavior: "instant",
    });
  });

  it("fires ONCE for a burst of vv events (debounce → no frame-by-frame slide)", () => {
    const { getByTestId } = render(<Harness />);
    const inp = getByTestId("inp") as HTMLInputElement;
    inp.getBoundingClientRect = () => rect(97, 133);
    inp.focus();
    for (let i = 0; i < 6; i++) {
      vv.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(30); // faster than the 250ms debounce
    }
    expect(window.scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(window.scrollBy).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when the input is NOT focused (page scroll near it)", () => {
    const { getByTestId } = render(<Harness />);
    const inp = getByTestId("inp") as HTMLInputElement;
    inp.getBoundingClientRect = () => rect(97, 133);
    inp.blur();
    vv.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(300);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
