/**
 * reserve-level-bar.test.tsx — held against needed, as a meter (260804).
 *
 * Two earlier attempts failed the same way: they asked the reader to decode a
 * shape. Stacked chunks did not say which was which; a "pipe" gave the outline
 * one meaning, the fill another and a hatched remainder a third — and hatching
 * is a texture, which belongs to accessibility fallbacks, not decoration.
 *
 * A ratio against a limit is a METER, and the target is drawn as a CONTAINER
 * (user's design, 260804): an outlined, taller box spanning what the history
 * asked for, with a thinner inner bar for what is actually held. Short, the
 * inner bar sits inside it with visible empty space; over, it runs out past the
 * outline's end. The outline IS the target, so no separate mark is needed.
 *
 * Colour follows the PART, never the whole bar. Holding 28,934 against a target
 * of 8,313 is 248% off, and painting the entire fill by that number turned the
 * bar solid red — including the 8,313 that is doing exactly its job (user
 * screenshot, 260804). Each stretch says what it is instead: covered is green,
 * surplus is the attention amber, and only an UNCOVERED requirement is red,
 * because that is the only one that can actually fail.
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
  it("outlines what the history asked for", () => {
    setup(9000, 3000);
    // Held sets the scale here, so the target box spans a third of the track.
    expect(pctOf("reserve-bar-target", "width")).toBeCloseTo(33.3, 0);
  });

  it("runs the held bar out past the outline when there is more than enough", () => {
    setup(9000, 3000);
    // The bar reaches the full track while the outline stops at a third.
    expect(pctOf("reserve-bar-covered", "width")).toBeCloseTo(33.3, 0);
    expect(pctOf("reserve-bar-surplus", "width")).toBeCloseTo(66.7, 0);
  });

  it("leaves visible empty space inside the outline when short", () => {
    setup(3000, 6000);
    // Outline spans the whole track; the held bar covers only half of it.
    expect(pctOf("reserve-bar-target", "width")).toBeCloseTo(100, 1);
    expect(pctOf("reserve-bar-covered", "width")).toBeCloseTo(50, 1);
    expect(screen.queryByTestId("reserve-bar-surplus")).toBeNull();
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

  it("greens the stretch that is doing its job and ambers the excess", () => {
    setup(9000, 3000);
    expect(
      screen.getByTestId("reserve-bar-covered").style.background,
    ).toContain("--trading-up");
    expect(
      screen.getByTestId("reserve-bar-surplus").style.background,
    ).toContain("--primary");
  });

  it("says the shortfall with the outline and the words, not more colour", () => {
    setup(3000, 6000);
    expect(
      screen.getByTestId("reserve-bar-covered").style.background,
    ).toContain("--trading-up");
    // The empty stretch is empty — the outline shows how far the target reaches
    // and the action line underneath says how much is missing.
    expect(screen.queryByTestId("reserve-bar-gap")).toBeNull();
  });

  it("is all green and nothing else when the two match", () => {
    setup(5000, 5000);
    expect(pctOf("reserve-bar-covered", "width")).toBeCloseTo(100, 1);
    expect(pctOf("reserve-bar-target", "width")).toBeCloseTo(100, 1);
    expect(screen.queryByTestId("reserve-bar-surplus")).toBeNull();
  });

  it("calls idle money attention, not alarm", () => {
    setup(9000, 3000);
    // Over-held is a slow loss, not a failure — amber, never the danger red.
    const action = screen.getByTestId("reserve-bar-action");
    expect(action.style.color).toContain("--primary");
  });

  it("calls an exposed buffer what it is", () => {
    setup(500, 5000);
    expect(screen.getByTestId("reserve-bar-action").style.color).toContain(
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

  it("drops the outline when the history asked for nothing", () => {
    setup(4000, 0);
    expect(screen.queryByTestId("reserve-bar-target")).toBeNull();
    // Nothing is covering anything — it is all spare.
    expect(pctOf("reserve-bar-surplus", "width")).toBeCloseTo(100, 1);
    expect(screen.queryByTestId("reserve-bar-covered")).toBeNull();
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
