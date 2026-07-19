/**
 * use-ios-keyboard-pan-fix.test.tsx — the reusable hook wiring the
 * windowPanCorrection to a standalone text input (wizard budget-name, investment
 * asset-name search). Verifies: while the input is focused, a visualViewport
 * resize scrolls the WINDOW by the correction; a no-op when the input isn't
 * focused. The math itself is covered by ios-keyboard-pan.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
    vv = Object.assign(new EventTarget(), { offsetTop: 120, height: 515 });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: vv,
    });
    window.scrollBy = vi.fn();
  });

  it("scrolls the window by the correction when the FOCUSED input overshot above the view", () => {
    const { getByTestId } = render(<Harness />);
    const inp = getByTestId("inp") as HTMLInputElement;
    inp.getBoundingClientRect = () => rect(97, 133); // visualTop = 97-120 = -23
    inp.focus();
    vv.dispatchEvent(new Event("resize"));
    // visualTop -23 < pad 16 → delta = -23 - 16 = -39.
    expect(window.scrollBy).toHaveBeenCalledWith(0, -39);
  });

  it("is a no-op when the input is NOT focused (page scroll near it)", () => {
    const { getByTestId } = render(<Harness />);
    const inp = getByTestId("inp") as HTMLInputElement;
    inp.getBoundingClientRect = () => rect(97, 133);
    inp.blur();
    vv.dispatchEvent(new Event("resize"));
    expect(window.scrollBy).not.toHaveBeenCalled();
  });
});
