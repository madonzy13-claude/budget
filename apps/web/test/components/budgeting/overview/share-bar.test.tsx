/**
 * share-bar.test.tsx — the stacked bar that replaced two figure strips.
 *
 * It must read at a glance and give up its numbers on hover (or tap, which is
 * the same event here): the caption under the bar names the segment you are on,
 * and falls back to the whole when you are on none.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const { ShareBar } = await import("@/components/budgeting/overview/share-bar");

const SEGMENTS = [
  { key: "within", label: "Planned spent", value: 48483, color: "#0f0" },
  { key: "reserve", label: "Used reserves", value: 16116, color: "#ff0" },
  { key: "over", label: "Overspent", value: 0, color: "#f00" },
];

const setup = () =>
  render(
    <ShareBar
      testId="spend-bar"
      segments={SEGMENTS}
      total={{ label: "Total spent", value: 64599 }}
      format={(n: number) => `${n} zl`}
    />,
  );

describe("ShareBar", () => {
  it("shows the whole until a segment is pointed at", () => {
    setup();
    expect(screen.getByTestId("spend-bar-caption").textContent).toContain(
      "Total spent",
    );
    expect(screen.getByTestId("spend-bar-caption").textContent).toContain(
      "64599 zl",
    );
  });

  it("draws a piece per segment that has money in it", () => {
    setup();
    expect(screen.getByTestId("spend-bar-piece-within")).toBeTruthy();
    expect(screen.getByTestId("spend-bar-piece-reserve")).toBeTruthy();
    // Overspent is zero here — nothing to draw.
    expect(screen.queryByTestId("spend-bar-piece-over")).toBeNull();
  });

  it("names the segment under the pointer", () => {
    setup();
    fireEvent.pointerEnter(screen.getByTestId("spend-bar-piece-reserve"));
    const caption = screen.getByTestId("spend-bar-caption");
    expect(caption.textContent).toContain("Used reserves");
    expect(caption.textContent).toContain("16116 zl");
  });

  it("goes back to the whole when the pointer leaves", () => {
    setup();
    const piece = screen.getByTestId("spend-bar-piece-reserve");
    fireEvent.pointerEnter(piece);
    fireEvent.pointerLeave(piece);
    expect(screen.getByTestId("spend-bar-caption").textContent).toContain(
      "Total spent",
    );
  });

  it("says nothing at all when there is nothing to show", () => {
    render(
      <ShareBar
        testId="spend-bar"
        segments={[{ key: "a", label: "A", value: 0, color: "#0f0" }]}
        total={{ label: "Total", value: 0 }}
        format={(n: number) => `${n}`}
      />,
    );
    expect(screen.queryByTestId("spend-bar")).toBeNull();
  });

  it("keeps each piece reachable by keyboard", () => {
    setup();
    const piece = screen.getByTestId("spend-bar-piece-within");
    expect(piece.getAttribute("tabindex")).toBe("0");
    fireEvent.focus(piece);
    expect(screen.getByTestId("spend-bar-caption").textContent).toContain(
      "Planned spent",
    );
  });
});
