/**
 * reserve-level-bar.test.tsx — held against needed, drawn as layers (260804).
 *
 * The stacked version read as three unrelated chunks. This one is a pipe: its
 * outline is what the history asked for, the fill inside is what is actually
 * held. Under-filled, the gap is what to top up; filled past the end, the
 * overflow is what can come out.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const { ReserveLevelBar } =
  await import("@/components/budgeting/overview/reserve-level-bar");

const setup = (heldCents: number, neededCents: number) =>
  render(
    <ReserveLevelBar
      heldCents={heldCents}
      neededCents={neededCents}
      format={(n: number) => `${n} zl`}
      testId="reserve-bar"
    />,
  );

const width = (testId: string) =>
  parseFloat(screen.getByTestId(testId).style.width);

describe("ReserveLevelBar", () => {
  it("draws the pipe at what the history asked for", () => {
    setup(3000, 6000);
    // needed is the whole scale here — held is short of it.
    expect(width("reserve-bar-pipe")).toBeCloseTo(100, 1);
    expect(width("reserve-bar-fill")).toBeCloseTo(50, 1);
  });

  it("shows the gap that still has to go in", () => {
    setup(3000, 6000);
    fireEvent.pointerEnter(screen.getByTestId("reserve-bar-gap"));
    const tip = screen.getByTestId("reserve-bar-tooltip");
    expect(tip.textContent).toContain("reserveFit.topUp");
    expect(tip.textContent).toContain("3000 zl");
  });

  it("draws the overflow past the pipe when there is more than enough", () => {
    setup(9000, 3000);
    // Scale is the held amount: the pipe takes a third, the overflow the rest.
    expect(width("reserve-bar-pipe")).toBeCloseTo(33.3, 0);
    expect(width("reserve-bar-overflow")).toBeCloseTo(66.7, 0);
    expect(screen.queryByTestId("reserve-bar-gap")).toBeNull();
  });

  it("names the overflow as money that can come out", () => {
    setup(9000, 3000);
    fireEvent.pointerEnter(screen.getByTestId("reserve-bar-overflow"));
    const tip = screen.getByTestId("reserve-bar-tooltip");
    expect(tip.textContent).toContain("reserveFit.canWithdraw");
    expect(tip.textContent).toContain("6000 zl");
  });

  it("names the fill as what is held", () => {
    setup(9000, 3000);
    fireEvent.pointerEnter(screen.getByTestId("reserve-bar-fill"));
    expect(screen.getByTestId("reserve-bar-tooltip").textContent).toContain(
      "reserveFit.heldTotal",
    );
  });

  it("says nothing until something is pointed at", () => {
    setup(9000, 3000);
    expect(screen.queryByTestId("reserve-bar-tooltip")).toBeNull();
  });

  it("fills the pipe exactly when held meets needed", () => {
    setup(5000, 5000);
    expect(width("reserve-bar-fill")).toBeCloseTo(100, 1);
    expect(screen.queryByTestId("reserve-bar-gap")).toBeNull();
    expect(screen.queryByTestId("reserve-bar-overflow")).toBeNull();
  });

  it("draws nothing at all when there is nothing either way", () => {
    setup(0, 0);
    expect(screen.queryByTestId("reserve-bar")).toBeNull();
  });

  it("holds money against no requirement at all", () => {
    setup(4000, 0);
    expect(screen.queryByTestId("reserve-bar-pipe")).toBeNull();
    expect(width("reserve-bar-overflow")).toBeCloseTo(100, 1);
  });
});
