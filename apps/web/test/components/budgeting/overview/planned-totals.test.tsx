/**
 * planned-totals.test.tsx — the figures under the timeline's picker (260803).
 *
 * Two tiers, because they answer two questions. The top three are the BREAKDOWN
 * of what was spent — limit, reserve, overspend — in the same green/yellow/red
 * the line below them is drawn in, so they read as its key. The bottom three are
 * the COMPARISON: spent against planned, and the gap between.
 *
 * The three parts sum to total spent; that is the invariant tying the tiers.
 */
import { describe, it, expect, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  // Echoes the KEY (so assertions stay readable) but resolves it against the
  // real en.json first and throws when it is missing: a typo'd key rendered as
  // a silent MISSING_MESSAGE in production while every test passed (260804).
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, unknown>) => {
      const path = `${ns}.${key}`.split(".");
      let node: unknown = messages;
      for (const part of path) {
        node = (node as Record<string, unknown> | undefined)?.[part];
        if (node === undefined)
          throw new Error(`missing i18n key: ${path.join(".")}`);
      }
      return vars ? `${key}:${Object.values(vars).join(",")}` : key;
    },
  useLocale: () => "en",
}));

const { PlannedTotals } =
  await import("@/components/budgeting/overview/planned-totals");

const fmt = (c: bigint) => `${Number(c) / 100} zl`;

const renderTotals = (
  props: Partial<Parameters<typeof PlannedTotals>[0]> = {},
) =>
  render(
    <PlannedTotals
      plannedCents="2900000"
      spentCents="2530200"
      withinLimitCents="2362900"
      reserveUsedCents="87000"
      overspentCents="80300"
      format={fmt}
      {...props}
    />,
  ).container;

const cell = (k: string) => screen.getByTestId(`planned-total-${k}`);

describe("PlannedTotals", () => {
  // 260804: the three figures became one bar — the shape shows a sliver of red
  // without anyone reading a number, and hovering a piece names its amount.
  it("breaks the spend into limit, reserve and overspend", () => {
    renderTotals();
    for (const k of ["within", "reserve", "overspent"])
      expect(screen.getByTestId(`planned-breakdown-piece-${k}`)).toBeTruthy();
  });

  it("floats the type and amount over whatever is scrubbed", () => {
    renderTotals();
    const track = screen.getByTestId("planned-breakdown-track");
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
    // 23,629 of 25,302 is the first ~93%; 96% is inside the reserve piece.
    fireEvent.pointerMove(track, { clientX: 96 });
    const tip = screen.getByTestId("planned-breakdown-tooltip");
    expect(tip.textContent).toContain("planned.fromReserve");
    expect(tip.textContent).toContain("870 zl");
  });

  it("says nothing while nothing is pointed at", () => {
    renderTotals();
    expect(screen.queryByTestId("planned-breakdown-tooltip")).toBeNull();
  });

  it("sits on the money forecast's width", () => {
    renderTotals();
    const bar = screen.getByTestId("planned-breakdown");
    expect(bar.style.marginLeft).toBe("8px");
    expect(bar.style.marginRight).toBe("8px");
  });

  it("shows what was spent against what was planned", () => {
    renderTotals();
    expect(cell("spent").textContent).toBe("25302 zl");
    expect(cell("planned").textContent).toBe("29000 zl");
  });

  it("draws the limit-covered part in the line's green", () => {
    // It is the money the plan actually paid for — the green stretch of the
    // line — NOT the whole outgoing (260803 user request).
    renderTotals();
    expect(
      screen
        .getByTestId("planned-breakdown-piece-within")
        .getAttribute("style"),
    ).toContain("--trading-up");
  });

  it("reads the difference as the P/L stat does — percent big, amount under", () => {
    // Same shape as the Investments P/L metric (user screenshot, 260803): the
    // percent leads with its arrow, the money sits beneath it, quieter.
    renderTotals();
    const stat = screen.getByTestId("planned-total-difference");
    expect(stat.textContent).toContain("12.8%");
    expect(stat.textContent).toContain("3698 zl");
    expect(stat.textContent).toContain("−");
  });

  it("sets itself apart from the picker and the chart, equally", () => {
    // 8px from a solid pill above and an open chart below read as unequal
    // (user report, 260803) — the figures carry their own margin on both sides.
    const c = renderTotals();
    const strip = c.querySelector('[data-testid="planned-totals"]')!;
    expect(strip.className).toContain("my-2");
  });

  // 260805: the bar is already a boundary; a rule under it cut the block in two
  // where nothing needed separating.
  it("runs no rule between the bar and the totals", () => {
    renderTotals();
    const totals = screen
      .getByTestId("planned-totals")
      .querySelector(".grid") as HTMLElement;
    expect(totals.className).not.toContain("border-t");
  });

  // 260805: the averages moved here from under the by-category bars, where they
  // duplicated the same three questions in a second place. Each total now says
  // what it comes to in a month, right beneath itself.
  describe("per month", () => {
    it("says what each total comes to in a month", () => {
      // 29,000 planned and 25,302 spent over 4 months.
      renderTotals({ months: 4 });
      expect(cell("planned-avg").textContent).toContain("7250");
      expect(cell("spent-avg").textContent).toContain("6325");
    });

    it("reads the difference as a monthly figure, not a range total", () => {
      renderTotals({ months: 4 });
      // −3,698 over the range is −924 a month.
      const diff = cell("difference").textContent ?? "";
      expect(diff).toContain("924");
      expect(diff).not.toContain("3698");
    });

    // The percent is a ratio, so it is the same whether it is read over the
    // range or over one month — it stays as it was.
    it("leaves the percent alone", () => {
      renderTotals({ months: 4 });
      expect(cell("difference").textContent).toContain("12.8%");
    });

    it("says nothing per month when the range is a single month", () => {
      renderTotals({ months: 1 });
      expect(screen.queryByTestId("planned-total-planned-avg")).toBeNull();
    });

    // 260805: the percent led at one size up, so the third column stood taller
    // than the two beside it and the row looked broken.
    it("stands the same height as the figures beside it", () => {
      renderTotals({ months: 4 });
      const size = (el: Element) =>
        el.className.match(/text-num-[a-z]+/)?.[0] ?? "";
      expect(size(cell("difference-pct"))).toBe(size(cell("spent")));
      expect(size(cell("difference-pct"))).not.toBe("");
    });

    it("marks the monthly figures as monthly, for a reader who cannot see", () => {
      renderTotals({ months: 4 });
      expect(cell("planned-avg").getAttribute("aria-label")).toContain(
        "perMonth",
      );
    });
  });

  it("centres every figure over its label", () => {
    renderTotals();
    for (const k of ["spent", "planned"])
      expect(cell(k).parentElement!.className).toContain("text-center");
  });

  it("draws no piece for a part with nothing in it", () => {
    // Zero has nothing to say, and a zero-width sliver is worse than absent.
    renderTotals({ withinLimitCents: "0" });
    expect(screen.queryByTestId("planned-breakdown-piece-within")).toBeNull();
  });

  it("drops the colour while the range is the running month alone", () => {
    // Five days into August, being under the plan says nothing yet — it reads
    // plain rather than green or red (260803 request).
    renderTotals({ rangeWithinRunningMonth: true });
    const pct = screen.getByTestId("planned-total-difference-pct");
    expect(pct.className).toContain("--body-on-dark");
    expect(pct.className).not.toContain("trading-");
  });

  it("colours the gap by DISTANCE from plan, not by direction", () => {
    // Within 10% is on plan and green either way; to 30% yellow; beyond red
    // (260803 user decision). Being 5% under is not a triumph, and 50% under is
    // as much a planning miss as 50% over.
    const style = (spent: string) => {
      const c = render(
        <PlannedTotals
          plannedCents="100000"
          spentCents={spent}
          withinLimitCents={spent}
          reserveUsedCents="0"
          overspentCents="0"
          format={fmt}
        />,
      ).container;
      return (
        c
          .querySelector('[data-testid="planned-total-difference-pct"]')
          ?.getAttribute("style") ?? ""
      );
    };
    expect(style("95000")).toContain("--trading-up"); // -5%  green
    expect(style("108000")).toContain("--trading-up"); // +8%  green
    expect(style("80000")).toContain("--primary"); // -20% yellow
    expect(style("125000")).toContain("--primary"); // +25% yellow
    expect(style("50000")).toContain("--trading-down"); // -50% red
    expect(style("200000")).toContain("--trading-down"); // +100% red
  });

  it("keeps the colour once the range reaches past the running month", () => {
    // A 3-month range is mostly finished history, so the gap IS a verdict even
    // though its end months are pro-rated.
    renderTotals({ rangeWithinRunningMonth: false });
    expect(
      screen.getByTestId("planned-total-difference-pct").getAttribute("style"),
    ).toBeTruthy();
  });

  it("reads an OVERspend as a positive difference", () => {
    renderTotals({ plannedCents: "100000", spentCents: "150000" });
    const stat = screen.getByTestId("planned-total-difference");
    expect(stat.textContent).toContain("+");
    expect(stat.textContent).toContain("50.0%");
  });

  it("says nothing about percent when there was no plan to compare to", () => {
    renderTotals({ plannedCents: "0", spentCents: "150000" });
    expect(
      screen.getByTestId("planned-total-difference").textContent,
    ).toContain("—");
  });

  it("draws only the pieces that carry money", () => {
    renderTotals({ reserveUsedCents: "0", overspentCents: "0" });
    expect(screen.queryByTestId("planned-breakdown-piece-reserve")).toBeNull();
    expect(
      screen.queryByTestId("planned-breakdown-piece-overspent"),
    ).toBeNull();
    expect(screen.getByTestId("planned-breakdown-piece-within")).toBeTruthy();
  });

  it("drops the reserve piece when the feature is off", () => {
    renderTotals({ reservesEnabled: false });
    expect(screen.queryByTestId("planned-breakdown-piece-reserve")).toBeNull();
    expect(screen.getByTestId("planned-breakdown-piece-within")).toBeTruthy();
  });

  it("reads a missing figure as zero rather than throwing", () => {
    renderTotals({ spentCents: "" });
    expect(cell("spent").textContent).toBe("0 zl");
  });
});
