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

  it("drops the colour when the plan is a PART-month forecast", () => {
    // Mid-month the plan is a forecast to today, so the gap is not a verdict —
    // it reads plain rather than green or red (260803 request).
    renderTotals({ plannedIsPartial: true });
    const pct = screen.getByTestId("planned-total-difference-pct");
    expect(pct.className).toContain("--body-on-dark");
    expect(pct.className).not.toContain("trading-");
  });

  it("still colours the gap over a whole range", () => {
    renderTotals();
    expect(
      screen.getByTestId("planned-total-difference-pct").className,
    ).toContain("trading-");
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
