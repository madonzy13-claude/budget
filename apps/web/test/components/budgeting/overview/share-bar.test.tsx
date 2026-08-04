/**
 * share-bar.test.tsx — the stacked bar that replaced two figure strips.
 *
 * It must read at a glance and give up its numbers on hover (or tap, which is
 * the same event here) — as a floating tooltip like the money forecast's, not a
 * caption parked underneath (user, 260804). Nothing is pointed at, nothing is
 * said.
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
      format={(n: number) => `${n} zl`}
    />,
  );

describe("ShareBar", () => {
  it("says nothing until a piece is pointed at", () => {
    setup();
    expect(screen.queryByTestId("spend-bar-tooltip")).toBeNull();
  });

  it("draws a piece per segment that has money in it", () => {
    setup();
    expect(screen.getByTestId("spend-bar-piece-within")).toBeTruthy();
    expect(screen.getByTestId("spend-bar-piece-reserve")).toBeTruthy();
    // Overspent is zero here — nothing to draw.
    expect(screen.queryByTestId("spend-bar-piece-over")).toBeNull();
  });

  it("floats the type and amount over the piece under the pointer", () => {
    setup();
    fireEvent.pointerEnter(screen.getByTestId("spend-bar-piece-reserve"));
    const tip = screen.getByTestId("spend-bar-tooltip");
    expect(tip.textContent).toContain("Used reserves");
    expect(tip.textContent).toContain("16116 zl");
  });

  it("takes the tooltip away when the pointer leaves", () => {
    setup();
    const piece = screen.getByTestId("spend-bar-piece-reserve");
    fireEvent.pointerEnter(piece);
    fireEvent.pointerLeave(piece);
    expect(screen.queryByTestId("spend-bar-tooltip")).toBeNull();
  });

  it("sits exactly as wide as the chart it belongs to", () => {
    render(
      <ShareBar
        testId="inset-bar"
        segments={SEGMENTS}
        format={(n: number) => `${n}`}
        insetLeft={48}
        insetRight={8}
      />,
    );
    const bar = screen.getByTestId("inset-bar");
    expect(bar.style.marginLeft).toBe("48px");
    expect(bar.style.marginRight).toBe("8px");
  });

  it("says nothing at all when there is nothing to show", () => {
    render(
      <ShareBar
        testId="spend-bar"
        segments={[{ key: "a", label: "A", value: 0, color: "#0f0" }]}
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
    expect(screen.getByTestId("spend-bar-tooltip").textContent).toContain(
      "Planned spent",
    );
  });
});
