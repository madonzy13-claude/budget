/**
 * charts.test.tsx — render smoke tests for the Phase-11 chart wrappers (11-02).
 *
 * happy-dom does not lay out, so recharts' ResponsiveContainer can report 0×0. We
 * shim element box size + ResizeObserver so the SVG has a chance to render, but the
 * assertions stay at smoke level (mounts without throwing) per the plan — NOT pixel
 * geometry, which recharts + happy-dom cannot measure.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewLineChart } from "@/components/budgeting/charts/line-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";

beforeAll(() => {
  // Give ResponsiveContainer a non-zero box in happy-dom.
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

const timeline = [
  { month: "2026-01", real: 120000, planned: 150000 },
  { month: "2026-02", real: 90000, planned: 150000 },
  { month: "2026-03", real: 175000, planned: 150000 },
];

const series = [
  { key: "real", label: "Real" },
  { key: "planned", label: "Planned", dashed: true },
];

const byCategory = [
  { name: "Groceries", value: 42000 },
  { name: "Transport", value: 18000 },
  { name: "Rent", value: 130000 },
];

function box(node: React.ReactNode) {
  return render(<div style={{ width: 400, height: 240 }}>{node}</div>);
}

describe("Overview charts", () => {
  it("renders an area chart without throwing", () => {
    const { container } = box(
      <OverviewAreaChart data={timeline} xKey="month" series={series} />,
    );
    expect(container).toBeTruthy();
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });

  it("renders a line chart without throwing", () => {
    const { container } = box(
      <OverviewLineChart data={timeline} xKey="month" series={series} />,
    );
    expect(container).toBeTruthy();
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });

  it("renders a vertical bar chart without throwing", () => {
    const { container } = box(
      <OverviewBarChart
        data={byCategory}
        xKey="name"
        series={[{ key: "value", label: "Spend" }]}
        layout="vertical"
      />,
    );
    expect(container).toBeTruthy();
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });

  it("renders a pie chart without throwing", () => {
    const { container } = box(
      <OverviewPieChart
        data={byCategory}
        nameKey="name"
        valueKey="value"
        colorFor={(name) => (name === "Rent" ? "#fbbf24" : "#4ea1ff")}
      />,
    );
    expect(container).toBeTruthy();
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
  });

  it("handles a pie slice tap without throwing (active-index path)", () => {
    const { container } = box(
      <OverviewPieChart
        data={byCategory}
        nameKey="name"
        valueKey="value"
        colorFor={() => "#4ea1ff"}
      />,
    );
    // Click whatever sector path recharts rendered (if any); the handler must not throw.
    const slice = container.querySelector("path.recharts-sector");
    expect(() => {
      if (slice) fireEvent.click(slice);
    }).not.toThrow();
    expect(container).toBeTruthy();
  });
});
