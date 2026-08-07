/**
 * share-bar.test.tsx — the stacked bar that replaced two figure strips.
 *
 * It must read at a glance and give up its numbers on hover — as a floating
 * tooltip like the money forecast's, not a caption parked underneath. And like
 * the forecast, the whole strip is one scrub surface: moving or dragging across
 * it slides the tooltip from piece to piece, rather than each piece waiting to
 * be entered separately (user, 260804).
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

const setup = () => {
  const r = render(
    <ShareBar
      testId="spend-bar"
      segments={SEGMENTS}
      format={(n: number) => `${n} zl`}
    />,
  );
  const track = screen.getByTestId("spend-bar-track");
  // happy-dom gives every element a zero-width box; the scrub maths needs a real
  // one to turn a clientX into a fraction.
  track.getBoundingClientRect = () =>
    ({
      left: 0,
      width: 100,
      right: 100,
      top: 0,
      bottom: 12,
      height: 12,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return r;
};

/** Scrub to a percentage along the track. */
const scrubTo = (pct: number) =>
  fireEvent.pointerMove(screen.getByTestId("spend-bar-track"), {
    clientX: pct,
  });

describe("ShareBar", () => {
  // 260805: "16,116 zł" alone says nothing about how big a slice that is; the
  // whole point of a part-to-whole bar is the share, so the tooltip carries it.
  it("says what share of the whole the piece is", () => {
    setup();
    scrubTo(90);
    // 16,116 of 64,599.
    expect(screen.getByTestId("spend-bar-tooltip").textContent).toContain(
      "25%",
    );
  });

  // The pieces are DRAWN with a 4% floor so a sliver stays hoverable — the share
  // must come from the money, or a 0.2% overspend would claim 4%.
  it("reads the share from the money, not from the drawn width", () => {
    render(
      <ShareBar
        testId="tiny-bar"
        segments={[
          { key: "big", label: "Planned spent", value: 99900, color: "#0f0" },
          { key: "over", label: "Overspent", value: 100, color: "#f00" },
        ]}
        format={(n: number) => `${n} zl`}
      />,
    );
    const track = screen.getByTestId("tiny-bar-track");
    track.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 100,
        right: 100,
        top: 0,
        bottom: 12,
        height: 12,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerMove(track, { clientX: 99 });
    const tip = screen.getByTestId("tiny-bar-tooltip").textContent ?? "";
    expect(tip).toContain("Overspent");
    expect(tip).toContain("0.1%");
    expect(tip).not.toContain("4%");
  });

  // 260805: the range total alone left the reader dividing in their head — the
  // figures under the bar all carry their monthly figure, so the pieces do too.
  it("carries the piece's monthly figure on a second row", () => {
    render(
      <ShareBar
        testId="avg-bar"
        segments={SEGMENTS}
        format={(n: number) => `${n} zl`}
        months={4}
      />,
    );
    const track = screen.getByTestId("avg-bar-track");
    track.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 100,
        right: 100,
        top: 0,
        bottom: 12,
        height: 12,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerMove(track, { clientX: 90 });
    const tip = screen.getByTestId("avg-bar-tooltip").textContent ?? "";
    expect(tip).toContain("16116 zl"); // the range
    expect(tip).toContain("4029 zl"); // …and a month of it
  });

  it("says nothing about a month when the range is one month", () => {
    setup();
    scrubTo(90);
    expect(screen.queryByTestId("spend-bar-tooltip-per-month")).toBeNull();
  });

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

  it("floats the type and amount over whatever the pointer is on", () => {
    setup();
    // 48,483 of 64,599 is the first ~75% of the track; 90% is inside the second.
    scrubTo(90);
    const tip = screen.getByTestId("spend-bar-tooltip");
    expect(tip.textContent).toContain("Used reserves");
    expect(tip.textContent).toContain("16116 zl");
  });

  it("slides from piece to piece as the pointer drags across", () => {
    setup();
    scrubTo(90);
    expect(screen.getByTestId("spend-bar-tooltip").textContent).toContain(
      "Used reserves",
    );
    scrubTo(20);
    expect(screen.getByTestId("spend-bar-tooltip").textContent).toContain(
      "Planned spent",
    );
  });

  it("follows the pointer rather than parking on the piece's middle", () => {
    setup();
    scrubTo(20);
    const near = screen.getByTestId("spend-bar-tooltip").style.left;
    scrubTo(60);
    expect(screen.getByTestId("spend-bar-tooltip").style.left).not.toBe(near);
  });

  it("takes the tooltip away when the pointer leaves the strip", () => {
    setup();
    scrubTo(90);
    fireEvent.pointerLeave(screen.getByTestId("spend-bar-track"));
    expect(screen.queryByTestId("spend-bar-tooltip")).toBeNull();
  });

  // The money forecast is a card with 16px of padding; a section body has 8px.
  // Same outer card, so 8px more each side puts the strip on exactly the
  // forecast band's width (user, 260804).
  it("lines up with the money forecast band by default", () => {
    setup();
    const bar = screen.getByTestId("spend-bar");
    expect(bar.style.marginLeft).toBe("8px");
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

  // A tooltip must never be the only way to read a value: a screen reader gets
  // the same label without pointing at anything.
  it("names each piece and its amount for a screen reader", () => {
    setup();
    expect(
      screen.getByTestId("spend-bar-piece-within").getAttribute("aria-label"),
    ).toBe("Planned spent: 48483 zl");
  });
});
