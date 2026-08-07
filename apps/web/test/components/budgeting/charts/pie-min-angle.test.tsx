/**
 * pie-min-angle.test.tsx — a slice too thin to hit is a slice you cannot read.
 *
 * On a real budget the capitalization donut has 0.2%-sized pools; their arcs
 * came out a couple of pixels wide, so tapping one was luck (user screenshot,
 * 260804). Every pie now asks recharts for a minimum angle per sector, which
 * borrows a sliver from the big slices and leaves the small ones tappable. The
 * centre read-out still quotes the TRUE share, so nothing is misreported.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";

beforeAll(() => {
  // Give ResponsiveContainer a non-zero box in happy-dom, as the sibling chart
  // suite does — with a zero box recharts renders no children at all.
  for (const [prop, value] of [
    ["offsetWidth", 400],
    ["offsetHeight", 400],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      value,
    });
  }
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 400,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
});

const pieProps: Record<string, unknown>[] = [];

vi.mock("recharts", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("recharts");
  return {
    ...actual,
    Pie: (props: Record<string, unknown>) => {
      pieProps.push(props);
      return null;
    },
  };
});

const { OverviewPieChart, MIN_SLICE_ANGLE_DEG } =
  await import("@/components/budgeting/charts/pie-chart");

const DATA = [
  { name: "Investments", value: 900000 },
  { name: "Crumb", value: 200 },
];

describe("pie minimum slice angle", () => {
  it("is big enough to put a finger on", () => {
    // Measured on a phone: 6° gives a 27×8px sector for a 0.03% slice. Less
    // than 5° and it is back to a coin-flip tap.
    expect(MIN_SLICE_ANGLE_DEG).toBeGreaterThanOrEqual(5);
  });

  it("asks for it on the category slices", () => {
    pieProps.length = 0;
    render(
      <div style={{ width: 400, height: 400 }}>
        <OverviewPieChart
          data={DATA}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
        />
      </div>,
    );
    expect(pieProps.at(-1)?.minAngle).toBe(MIN_SLICE_ANGLE_DEG);
  });

  it("asks for it on the outer ring too", () => {
    pieProps.length = 0;
    render(
      <div style={{ width: 400, height: 400 }}>
        <OverviewPieChart
          data={DATA}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          outerRing={{
            data: [
              { name: "Needs", value: 900000 },
              { name: "Sliver", value: 100 },
            ],
            colorFor: () => "#6b7280",
          }}
        />
      </div>,
    );
    expect(pieProps.every((p) => p.minAngle === MIN_SLICE_ANGLE_DEG)).toBe(
      true,
    );
    expect(pieProps.length).toBe(2);
  });
});
