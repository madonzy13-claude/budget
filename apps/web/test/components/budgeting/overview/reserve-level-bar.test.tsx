/**
 * reserve-level-bar.test.tsx — held against needed, as a meter (260804).
 *
 * Two earlier attempts failed the same way: they asked the reader to decode a
 * shape. Stacked chunks did not say which was which; a "pipe" gave the outline
 * one meaning, the fill another and a hatched remainder a third — and hatching
 * is a texture, which belongs to accessibility fallbacks, not decoration.
 *
 * A ratio against a limit is a METER: one bar for what is held, a target mark
 * for what the history asked for. Past the mark, money is idle; short of it, the
 * buffer is exposed. Every figure is direct-labelled — the hover only repeats
 * what is already on screen.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import messages from "../../../../messages/en.json";

vi.mock("next-intl", () => ({
  // Echoes the key, but resolves it against the real en.json first and throws
  // when it is missing — a typo'd key renders as MISSING_MESSAGE in the browser
  // while the suite stays green otherwise (260804).
  useTranslations: (ns: string) => (key: string) => {
    let node: unknown = messages;
    for (const part of `${ns}.${key}`.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
      if (node === undefined) throw new Error(`missing i18n key: ${ns}.${key}`);
    }
    return key;
  },
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

const pctOf = (testId: string, prop: "width" | "left") =>
  parseFloat(screen.getByTestId(testId).style[prop]);

describe("ReserveLevelBar", () => {
  it("fills the meter to what is held", () => {
    setup(3000, 6000);
    // Needed is the larger figure, so it sets the scale.
    expect(pctOf("reserve-bar-fill", "width")).toBeCloseTo(50, 1);
  });

  it("marks what the history asked for", () => {
    setup(9000, 3000);
    // Held sets the scale here, so the mark sits a third along.
    expect(pctOf("reserve-bar-mark", "left")).toBeCloseTo(33.3, 0);
    expect(pctOf("reserve-bar-fill", "width")).toBeCloseTo(100, 1);
  });

  it("says what to do when the buffer is short", () => {
    setup(3000, 6000);
    const action = screen.getByTestId("reserve-bar-action");
    expect(action.textContent).toContain("reserveFit.topUp");
    expect(action.textContent).toContain("3000 zl");
  });

  it("says what can come out when there is more than enough", () => {
    setup(9000, 3000);
    const action = screen.getByTestId("reserve-bar-action");
    expect(action.textContent).toContain("reserveFit.canWithdraw");
    expect(action.textContent).toContain("6000 zl");
  });

  it("says nothing needs doing when the two match", () => {
    setup(5000, 5000);
    expect(screen.getByTestId("reserve-bar-action").textContent).toContain(
      "reserveFit.inBalance",
    );
  });

  // Both directions are a problem — too little is overspend risk, too much is
  // idle money — so the meter bands by DISTANCE, the same way the bars under it
  // do: close is green, further yellow, far red.
  it("reads green while the buffer is about right", () => {
    setup(5200, 5000);
    expect(screen.getByTestId("reserve-bar-fill").style.background).toContain(
      "--trading-up",
    );
  });

  it("reads red when it is nowhere near", () => {
    setup(500, 5000);
    expect(screen.getByTestId("reserve-bar-fill").style.background).toContain(
      "--trading-down",
    );
  });

  // Nothing is hover-gated: the two figures the meter compares are both on
  // screen without pointing at anything.
  it("labels both figures without being pointed at", () => {
    setup(9000, 3000);
    expect(screen.getByTestId("reserve-bar-held").textContent).toContain(
      "9000 zl",
    );
    expect(screen.getByTestId("reserve-bar-needed").textContent).toContain(
      "3000 zl",
    );
  });

  it("drops the mark when the history asked for nothing", () => {
    setup(4000, 0);
    expect(screen.queryByTestId("reserve-bar-mark")).toBeNull();
    expect(screen.getByTestId("reserve-bar-action").textContent).toContain(
      "reserveFit.canWithdraw",
    );
  });

  it("draws nothing at all when there is nothing either way", () => {
    setup(0, 0);
    expect(screen.queryByTestId("reserve-bar")).toBeNull();
  });

  it("sits on the money forecast's width", () => {
    setup(9000, 3000);
    const bar = screen.getByTestId("reserve-bar");
    expect(bar.style.marginLeft).toBe("8px");
    expect(bar.style.marginRight).toBe("8px");
  });
});
