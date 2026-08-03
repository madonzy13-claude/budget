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

  it("reads the difference as amount AND percent, under plan", () => {
    renderTotals();
    // 25,302 spent against 29,000 planned → 3,698 under, 12.75% → 13%.
    expect(cell("difference").textContent).toContain("3698 zl");
    expect(cell("difference").textContent).toContain("13%");
    expect(cell("difference").textContent).toContain("−");
  });

  it("reads an OVERspend as a positive difference", () => {
    renderTotals({ plannedCents: "100000", spentCents: "150000" });
    expect(cell("difference").textContent).toContain("+");
    expect(cell("difference").textContent).toContain("50%");
  });

  it("says nothing about percent when there was no plan to compare to", () => {
    renderTotals({ plannedCents: "0", spentCents: "150000" });
    expect(cell("difference").textContent).not.toContain("%");
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
