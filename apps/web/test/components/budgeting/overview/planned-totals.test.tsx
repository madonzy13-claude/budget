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
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
  it("breaks the spend into limit, reserve and overspend", () => {
    renderTotals();
    expect(cell("within").textContent).toBe("23629 zl");
    expect(cell("reserve").textContent).toBe("870 zl");
    expect(cell("overspent").textContent).toBe("803 zl");
  });

  it("shows what was spent against what was planned", () => {
    renderTotals();
    expect(cell("spent").textContent).toBe("25302 zl");
    expect(cell("planned").textContent).toBe("29000 zl");
  });

  it("names the limit-covered part 'Planned spent', in the line's green", () => {
    // It is the money the plan actually paid for — the green stretch of the
    // line — NOT the whole outgoing (260803 user request).
    renderTotals();
    expect(screen.getByText("planned.fromPlan")).toBeTruthy();
    expect(cell("within").getAttribute("style") ?? "").toContain(
      "--trading-up",
    );
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

  it("centres every figure over its label", () => {
    renderTotals();
    for (const k of ["within", "reserve", "overspent", "spent", "planned"])
      expect(cell(k).parentElement!.className).toContain("text-center");
  });

  it("leaves Planned spent white when nothing was spent inside the plan", () => {
    // Green says "this went well"; zero has nothing to say (260803 request).
    renderTotals({ withinLimitCents: "0" });
    expect(cell("within").getAttribute("style")).toBeFalsy();
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

  it("colours the reserve and overspend only once there is something to colour", () => {
    renderTotals({ reserveUsedCents: "0", overspentCents: "0" });
    for (const k of ["reserve", "overspent"])
      expect(cell(k).getAttribute("style")).toBeFalsy();
  });

  it("drops the reserve figure when the feature is off", () => {
    renderTotals({ reservesEnabled: false });
    expect(screen.queryByTestId("planned-total-reserve")).toBeNull();
    expect(cell("within")).toBeTruthy();
  });

  it("reads a missing figure as zero rather than throwing", () => {
    renderTotals({ spentCents: "" });
    expect(cell("spent").textContent).toBe("0 zl");
  });
});
