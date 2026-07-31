/**
 * diverging-bar-chart.test.tsx — the percent-based over/under chart (260731).
 *
 * The chart reads VARIANCE, not amounts: bars grow right when a category spends
 * more than planned, left when it spends less, and anything inside ±10% counts as
 * on-plan. happy-dom cannot lay out, so the assertions stay at the level recharts
 * can express there — the pure domain/classification helpers are unit-tested
 * directly, plus a mount smoke test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import {
  OverviewDivergingBarChart,
  divergingDomain,
  varianceBand,
  ON_PLAN_BAND_PCT,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { SlotRevealProvider } from "@/components/budgeting/overview/slot-amount";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 240,
  });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 400,
      height: 240,
      top: 0,
      left: 0,
      right: 400,
      bottom: 240,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  });
  if (!("ResizeObserver" in globalThis)) {
    // @ts-expect-error minimal shim
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe("Variance bands", () => {
  it("treats ±10% as on plan", () => {
    expect(varianceBand(0)).toBe("on-plan");
    expect(varianceBand(ON_PLAN_BAND_PCT)).toBe("on-plan");
    expect(varianceBand(-ON_PLAN_BAND_PCT)).toBe("on-plan");
  });

  it("classifies beyond the band as over / under", () => {
    expect(varianceBand(10.1)).toBe("over");
    expect(varianceBand(85)).toBe("over");
    expect(varianceBand(-10.1)).toBe("under");
    expect(varianceBand(-60)).toBe("under");
  });
});

describe("Symmetric domain", () => {
  it("is always centred on zero", () => {
    const [min, max] = divergingDomain([12, -40, 5]);
    expect(min).toBe(-max);
  });

  it("never collapses below the on-plan band, so small variances stay readable", () => {
    const [min, max] = divergingDomain([2, -1]);
    expect(max).toBeGreaterThanOrEqual(ON_PLAN_BAND_PCT * 2);
    expect(min).toBe(-max);
  });

  it("rounds outward to a tidy tick and covers the biggest variance", () => {
    const [, max] = divergingDomain([37, -12]);
    expect(max).toBeGreaterThanOrEqual(37);
    expect(max % 10).toBe(0);
  });

  it("caps runaway outliers so one category can't flatten the rest", () => {
    const [, max] = divergingDomain([2500, 12]);
    expect(max).toBeLessThanOrEqual(200);
  });

  it("handles an empty set", () => {
    const [min, max] = divergingDomain([]);
    expect(min).toBe(-max);
    expect(max).toBeGreaterThan(0);
  });
});

describe("OverviewDivergingBarChart", () => {
  const rows = [
    { name: "Groceries", pct: 38, real: 138000, planned: 100000 },
    { name: "Transport", pct: -4, real: 48000, planned: 50000 },
    { name: "Fun", pct: -55, real: 22500, planned: 50000 },
  ];

  it("mounts without throwing", () => {
    const { container } = render(
      <SlotRevealProvider>
        <OverviewDivergingBarChart
          data={rows}
          categoryKey="name"
          valueKey="pct"
          formatTooltip={(n) => `€${(n / 100).toFixed(2)}`}
          labels={{ over: "Over", under: "Under", onPlan: "On plan" }}
        />
      </SlotRevealProvider>,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders a legend explaining the three bands", () => {
    const { getByText } = render(
      <SlotRevealProvider>
        <OverviewDivergingBarChart
          data={rows}
          categoryKey="name"
          valueKey="pct"
          formatTooltip={(n) => String(n)}
          labels={{ over: "Over", under: "Under", onPlan: "On plan" }}
        />
      </SlotRevealProvider>,
    );
    expect(getByText("Over")).toBeTruthy();
    expect(getByText("Under")).toBeTruthy();
    expect(getByText("On plan")).toBeTruthy();
  });
});
