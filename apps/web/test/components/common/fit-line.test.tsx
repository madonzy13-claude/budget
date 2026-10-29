/**
 * fit-line.test.tsx — one line that never wraps: when its content is wider
 * than the line, it scrolls to show the end and back (round-4 gap 17).
 * happy-dom does not lay out, so the widths are stubbed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
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

  it("a scrolling line fades both edges", () => {
    stubWidths(260, 200);
    render(<FitLine data-testid="line">a very long caption</FitLine>);
    expect(screen.getByTestId("line").className).toMatch(/fit-line-fade/);
  });

  // "If there's space, show instead of scrolling": the line may reach right
  // up to the element it must not cover (the share), and only scrolls past it.
  function Reach({ text }: { text: string }) {
    const stop = useRef<HTMLSpanElement>(null);
    return (
      <div>
        <FitLine data-testid="line" until={stop}>
          {text}
        </FitLine>
        <span ref={stop} data-testid="stop" />
      </div>
    );
  }
  it("uses the room up to `until` before scrolling", async () => {
    stubWidths(260, 200);
    const rect = (left: number) =>
      ({
        left,
        right: left,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
      }) as DOMRect;
    const orig = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      return rect(this.getAttribute("data-testid") === "stop" ? 300 : 0);
    };
    render(<Reach text="fits in the reach" />);
    const line = screen.getByTestId("line");
    await waitFor(() => expect(line.style.width).toBe("292px"));
    expect((line.firstElementChild as HTMLElement).className).not.toMatch(
      /fit-line-scroll/,
    );
    HTMLElement.prototype.getBoundingClientRect = orig;
  });
});
