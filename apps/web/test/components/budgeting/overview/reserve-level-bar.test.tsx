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
 * asked for, with a thinner inner bar for what is actually held. Over, the bar
 * runs out past the outline's end; short, the stretch it never reached is
 * struck through in a soft dashed red — empty space alone left the shortfall
 * looking like nothing rather than like something missing (user, 260804). The
 * outline IS the target, so no separate mark is needed.
 *
 * Colour follows the PART, never the whole bar. Holding 28,934 against a target
 * of 8,313 is 248% off, and painting the entire fill by that number turned the
 * bar solid red — including the 8,313 that is doing exactly its job (user
 * screenshot, 260804). Each stretch says what it is instead: covered is green,
 * surplus is the attention amber, and only an UNCOVERED requirement is red,
 * because that is the only one that can actually fail.
 */
import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
  // The held bar sits INSIDE the outline, by the same clearance it has above and
  // below — 16px box, 1px border, 6px bar leaves 4px, so 5px from the outer edge
  // (user, 260804).
  it("clears the outline by as much at the sides as at the top", () => {
    setup(3000, 6000);
    expect(
      parseFloat(screen.getByTestId("reserve-bar-covered").style.marginLeft),
    ).toBe(5);
    // Short: the outline's far edge is the track's end, and the dashes stop
    // 5px inside it.
    expect(screen.getByTestId("reserve-bar-gap").style.width).toBe(
      "calc(50% - 5px)",
    );
  });

  // Padding only works while the bar is INSIDE the box. Once it runs past, the
  // covered stretch has to land exactly ON the outline's right edge — short of
  // it and the idle dashes start inside the box, past it and the colour spills
  // over the border (user screenshots, 260804/05).
  it("lands on the outline exactly when the bar runs past it", () => {
    setup(28934, 4409);
    const covered = screen.getByTestId("reserve-bar-covered");
    expect(parseFloat(covered.style.marginLeft)).toBe(5);
    // 4409/28934 of the track, less the 5px the bar was pushed in by.
    expect(covered.style.width).toMatch(/^calc\(15\.23\d*% - 10px\)$/);
  });

  it("outlines what the history asked for", () => {
    setup(9000, 3000);
    // Held sets the scale here, so the target box spans a third of the track.
    expect(pctOf("reserve-bar-target", "width")).toBeCloseTo(33.3, 0);
  });

  it("runs the held bar out past the outline when there is more than enough", () => {
    setup(9000, 3000);
    // The outline stops a third along and the surplus carries on to the end.
    expect(screen.getByTestId("reserve-bar-covered").style.width).toContain(
      "33.33",
    );
    // …and stops a padding's width behind the outline, so the idle dashes can
    // start ON the border rather than inside it.
    expect(screen.getByTestId("reserve-bar-covered").style.width).toMatch(
      /- 10px\)$/,
    );
    expect(pctOf("reserve-bar-surplus", "width")).toBeCloseTo(66.7, 0);
  });

  it("keeps the held bar inside the outline when short", () => {
    setup(3000, 6000);
    // Outline spans the whole track; the held bar covers only half of it.
    expect(pctOf("reserve-bar-target", "width")).toBeCloseTo(100, 1);
    expect(screen.getByTestId("reserve-bar-covered").style.width).toBe(
      "calc(50% - 5px)",
    );
    expect(screen.queryByTestId("reserve-bar-surplus")).toBeNull();
  });

  it("reports how far below the target the buffer sits", () => {
    setup(3000, 6000);
    const action = screen.getByTestId("reserve-bar-action");
    // 260805: informative, not an instruction — the meter reports, it does not
    // tell the household what to do with its money.
    expect(action.textContent).toContain("reserveFit.belowTarget");
    expect(action.textContent).not.toContain("topUp");
    // The amount leads, so the line reads as one sentence.
    expect(action.textContent).toMatch(/^3000 zl/);
    expect(action.textContent).toContain("3000 zl");
  });

  it("reports how far above the target it sits", () => {
    setup(9000, 3000);
    const action = screen.getByTestId("reserve-bar-action");
    expect(action.textContent).toContain("reserveFit.aboveTarget");
    expect(action.textContent).not.toContain("canWithdraw");
    expect(action.textContent).toContain("6000 zl");
  });

  it("says it is exactly on target when the two match", () => {
    setup(5000, 5000);
    expect(screen.getByTestId("reserve-bar-action").textContent).toContain(
      "reserveFit.onTarget",
    );
  });

  // Grey, not green (user, 260804): the covered stretch is the baseline, not an
  // achievement — the colour in this shape belongs to what needs attention.
  // 260805: the covered stretch went green — the target IS met here — while the
  // excess past the outline stays amber, because idle money is not a win.
  it("greens the stretch that is doing its job and ambers the excess", () => {
    setup(9000, 3000);
    expect(
      screen.getByTestId("reserve-bar-covered").style.background,
    ).toContain("--trading-up");
    expect(
      screen.getByTestId("reserve-bar-surplus").style.background,
    ).toContain("--primary");
  });

  it("strikes the missing stretch through in a soft dashed red", () => {
    setup(3000, 6000);
    expect(
      screen.getByTestId("reserve-bar-covered").style.background,
    ).toContain("--trading-up");
    const gap = screen.getByTestId("reserve-bar-gap");
    expect(gap.style.width).toBe("calc(50% - 5px)");
    // Dashes, not a solid block: it is an absence, and it should not shout as
    // loudly as money that is really there.
    expect(gap.style.background).toContain("repeating-linear-gradient");
    expect(gap.style.background).toContain("--trading-down");
    expect(Number(gap.style.opacity)).toBeLessThan(1);
  });

  // 260805: the stretches were sized as percentages of the INNER row, which is
  // narrower than the track by the left inset — so every boundary drifted left
  // by up to that inset, and the idle dashes started INSIDE the outline they
  // were supposed to begin at (user screenshot).
  describe("stretch geometry", () => {
    const style = (id: string) => screen.getByTestId(id).style;

    it("measures the stretches against the whole track, not the inset row", () => {
      setup(15000, 9000);
      expect(style("reserve-bar-inner").left).toBe("0px");
      expect(style("reserve-bar-inner").right).toBe("0px");
    });

    it("ends the covered stretch exactly on the outline, so the idle dashes start there", () => {
      // needed 9,000 of a 15,000 scale — the outline's right edge is at 60%.
      setup(15000, 9000);
      expect(style("reserve-bar-covered").marginLeft).toBe("5px");
      expect(style("reserve-bar-covered").width).toBe("calc(60% - 10px)");
      // …and the idle stretch takes the rest, untrimmed: nothing contains it.
      // It starts a padding's width later, ON the outline's right edge.
      expect(style("reserve-bar-surplus").marginLeft).toBe("5px");
      expect(style("reserve-bar-surplus").width).toBe("40%");
    });

    it("keeps the shortfall inside the outline's far edge", () => {
      // held 3,000 of 6,000 needed: the outline spans the whole track.
      setup(3000, 6000);
      expect(style("reserve-bar-covered").width).toBe("calc(50% - 5px)");
      expect(style("reserve-bar-gap").width).toBe("calc(50% - 5px)");
    });

    it("insets both ends when the bar exactly fills the outline", () => {
      setup(6000, 6000);
      expect(style("reserve-bar-covered").width).toBe("calc(100% - 10px)");
    });
  });

  // 260805: the surplus is dashed too. Neither end of the bar is money doing its
  // job — one is missing and one is idle — and only the stretch that IS doing
  // its job stays solid.
  it("dashes the surplus stretch as well, in its own amber", () => {
    setup(9000, 3000);
    const surplus = screen.getByTestId("reserve-bar-surplus");
    expect(surplus.style.background).toContain("repeating-linear-gradient");
    expect(surplus.style.background).toContain("--primary");
    expect(Number(surplus.style.opacity)).toBeLessThan(1);
  });

  it("leaves the stretch that is doing its job solid", () => {
    setup(9000, 3000);
    const covered = screen.getByTestId("reserve-bar-covered");
    expect(covered.style.background).not.toContain("repeating-linear-gradient");
  });

  it("has nothing to strike through when the target is met", () => {
    setup(9000, 3000);
    expect(screen.queryByTestId("reserve-bar-gap")).toBeNull();
  });

  it("is all green and nothing else when the two match", () => {
    setup(5000, 5000);
    expect(screen.getByTestId("reserve-bar-covered").style.width).toBe(
      "calc(100% - 10px)",
    );
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

  // The target is what the bar is measured against, so it is read first
  // (user, 260804).
  it("reads needed first, then held", () => {
    setup(9000, 3000);
    const labels = screen.getByTestId("reserve-bar-labels");
    const order = [...labels.querySelectorAll("[data-testid]")].map((n) =>
      n.getAttribute("data-testid"),
    );
    expect(order).toEqual(["reserve-bar-needed", "reserve-bar-held"]);
  });

  it("drops the outline when the history asked for nothing", () => {
    setup(4000, 0);
    expect(screen.queryByTestId("reserve-bar-target")).toBeNull();
    // Nothing is covering anything — it is all spare.
    expect(pctOf("reserve-bar-surplus", "width")).toBeCloseTo(100, 1);
    expect(screen.queryByTestId("reserve-bar-covered")).toBeNull();
    expect(screen.getByTestId("reserve-bar-action").textContent).toContain(
      "reserveFit.aboveTarget",
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

  // 260805: the target is the thing being aimed at, so it wears the colour of
  // being on target — and the label that names it wears the same, or the reader
  // has to work out which grey line the words belong to.
  describe("the target reads as the target", () => {
    it("outlines the target in green, and fills nothing", () => {
      setup(5000, 10000);
      const el = screen.getByTestId("reserve-bar-target");
      expect(el.getAttribute("style")).toContain("--trading-up");
      // No wash inside it (user, 260805) — the outline alone is the target.
      expect(screen.queryByTestId("reserve-bar-wash")).toBeNull();
    });

    // 260805, second pass: green whatever the level. The money that IS held is
    // doing its job at any size, and what is missing is already said by the
    // dashed red beside it — greying the held stretch made a nearly-full
    // reserve look as inert as an empty one (user).
    it("draws the held bar green once the target is met", () => {
      setup(10000, 10000);
      expect(
        screen.getByTestId("reserve-bar-covered").getAttribute("style"),
      ).toContain("--trading-up");
    });

    it("keeps it green with more than enough held", () => {
      setup(24800, 10000);
      expect(
        screen.getByTestId("reserve-bar-covered").getAttribute("style"),
      ).toContain("--trading-up");
      // …and the surplus past the outline stays amber: idle money, not a win.
      expect(
        screen.getByTestId("reserve-bar-surplus").getAttribute("style"),
      ).toContain("--primary");
    });

    it("draws it green while the reserve is still short", () => {
      setup(9999, 10000);
      const style =
        screen.getByTestId("reserve-bar-covered").getAttribute("style") ?? "";
      expect(style).toContain("--trading-up");
      expect(style).not.toContain("--muted-foreground");
    });

    // 260805: all three stretches sit at the same weight — a solid green next to
    // two faded dashes read as a different kind of thing rather than the same
    // bar in three states.
    it("carries the same weight as the dashed stretches", () => {
      setup(24800, 10000);
      const o = (id: string) => Number(screen.getByTestId(id).style.opacity);
      expect(o("reserve-bar-covered")).toBe(o("reserve-bar-surplus"));
      expect(o("reserve-bar-covered")).toBeLessThan(1);
      cleanup();
      setup(3000, 10000);
      expect(o("reserve-bar-covered")).toBe(o("reserve-bar-gap"));
    });

    it("leaves the shortfall to say what is missing", () => {
      setup(3000, 10000);
      expect(screen.getByTestId("reserve-bar-gap").style.background).toContain(
        "--trading-down",
      );
    });

    it("names it in the same green", () => {
      setup(5000, 10000);
      const el = screen.getByTestId("reserve-bar-needed");
      expect(el.outerHTML).toContain("--trading-up");
    });

    it("leaves the held figure alone — it is not the target", () => {
      setup(5000, 10000);
      const el = screen.getByTestId("reserve-bar-held");
      expect(el.outerHTML).not.toContain("--trading-up");
    });
  });
});
