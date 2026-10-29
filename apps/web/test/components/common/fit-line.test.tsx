/**
 * fit-line.test.tsx — one line that never wraps: when its content is wider
 * than the line, it scrolls to show the end and back (round-4 gap 17).
 * happy-dom does not lay out, so the widths are stubbed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FitLine } from "../../../src/components/common/fit-line";

function stubWidths(scroll: number, client: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scroll,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => client,
  });
}
afterEach(() => {
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe("FitLine", () => {
  it("content that fits stays still", () => {
    stubWidths(100, 200);
    render(<FitLine data-testid="line">short</FitLine>);
    const inner = screen.getByTestId("line").firstElementChild as HTMLElement;
    expect(inner.className).not.toMatch(/fit-line-scroll/);
  });

  it("content wider than the line scrolls by exactly the overflow", () => {
    stubWidths(260, 200);
    render(<FitLine data-testid="line">a very long caption</FitLine>);
    const inner = screen.getByTestId("line").firstElementChild as HTMLElement;
    expect(inner.className).toMatch(/fit-line-scroll/);
    expect(inner.style.getPropertyValue("--fit-shift")).toBe("-60px");
  });
});
