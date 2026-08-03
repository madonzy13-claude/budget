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
  divergingTicks,
  varianceBand,
  varianceColor,
  symlog,
  symexp,
  ON_PLAN_BAND_PCT,
  varianceColorForRange,
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

describe("Variance bands (colour by how far off plan, either direction)", () => {
  it("green inside ±10%", () => {
    expect(varianceBand(0)).toBe("on-plan");
    expect(varianceBand(10)).toBe("on-plan");
    expect(varianceBand(-10)).toBe("on-plan");
  });

  it("yellow between 10% and 30% off, over OR under", () => {
    expect(varianceBand(10.1)).toBe("drift");
    expect(varianceBand(30)).toBe("drift");
    expect(varianceBand(-25)).toBe("drift");
    expect(varianceBand(-30)).toBe("drift");
  });

  it("red past 30% off, over OR under", () => {
    expect(varianceBand(30.1)).toBe("off");
    expect(varianceBand(408)).toBe("off");
    expect(varianceBand(-55)).toBe("off");
    expect(varianceBand(-100)).toBe("off");
  });

  it("maps each band to its colour", () => {
    expect(varianceColor(5)).toBe(varianceColor(-5));
    expect(varianceColor(5)).not.toBe(varianceColor(20));
    expect(varianceColor(20)).not.toBe(varianceColor(60));
  });
});

describe("Asymmetric domain", () => {
  it("spans from the lowest to the highest variance, rounded outward to 10", () => {
    const [min, max] = divergingDomain([408, -100, 37]);
    expect(min).toBeLessThanOrEqual(-100);
    expect(max).toBeGreaterThanOrEqual(408);
    // (a negative multiple of 10 gives -0 in JS, hence Math.abs)
    expect(Math.abs(min % 10)).toBe(0);
    expect(Math.abs(max % 10)).toBe(0);
  });

  it("does NOT cap outliers — a +408% category must fit on the axis", () => {
    const [, max] = divergingDomain([408]);
    expect(max).toBeGreaterThanOrEqual(408);
  });

  it("leaves headroom on both ends so the percent labels have room", () => {
    const [min, max] = divergingDomain([408, -100]);
    expect(max).toBeGreaterThan(408);
    expect(min).toBeLessThan(-100);
  });

  it("always contains zero, even when every category is over plan", () => {
    const [min, max] = divergingDomain([120, 60, 35]);
    expect(min).toBeLessThanOrEqual(0);
    expect(max).toBeGreaterThan(0);
  });

  it("keeps a readable span when every variance is tiny", () => {
    const [min, max] = divergingDomain([2, -1]);
    expect(max - min).toBeGreaterThanOrEqual(ON_PLAN_BAND_PCT * 4);
  });

  it("handles an empty set", () => {
    const [min, max] = divergingDomain([]);
    expect(max).toBeGreaterThan(min);
    expect(min).toBeLessThanOrEqual(0);
  });
});

describe("Symmetric-log scale (keeps a +408% bar from squashing the rest)", () => {
  it("is symmetric around zero", () => {
    expect(symlog(0)).toBe(0);
    expect(symlog(-50)).toBe(-symlog(50));
  });

  it("is monotonic — a bigger variance is always further from the centre", () => {
    const xs = [-408, -100, -37, -9, 0, 9, 37, 100, 408];
    const ys = xs.map(symlog);
    for (let i = 1; i < ys.length; i++)
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
  });

  it("round-trips back to the real percent", () => {
    for (const v of [-408, -55, -10, 0, 10, 55, 408]) {
      expect(symexp(symlog(v))).toBeCloseTo(v, 6);
    }
  });

  it("compresses the far end: 408% is nowhere near 4× the distance of 100%", () => {
    const ratio = symlog(408) / symlog(100);
    expect(ratio).toBeLessThan(2);
    expect(ratio).toBeGreaterThan(1);
  });

  it("stays near-linear inside the on-plan band, so small variances stay distinct", () => {
    const ratio = symlog(10) / symlog(5);
    expect(ratio).toBeGreaterThan(1.6);
  });
});

describe("Adaptive ticks", () => {
  it("only offers ticks inside the range and always includes zero", () => {
    const ticks = divergingTicks(-120, 460);
    expect(ticks).toContain(0);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(-120);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(460);
  });

  it("adapts its density to the spread — a tight range gets fine ticks", () => {
    const tight = divergingTicks(-40, 40);
    expect(tight.some((t) => Math.abs(t) > 0 && Math.abs(t) <= 20)).toBe(true);
  });

  it("is sorted and free of duplicates", () => {
    const ticks = divergingTicks(-500, 500);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(new Set(ticks).size).toBe(ticks.length);
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
        />
      </SlotRevealProvider>,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders no legend (the labels + colours carry it)", () => {
    const { queryByText } = render(
      <SlotRevealProvider>
        <OverviewDivergingBarChart
          data={rows}
          categoryKey="name"
          valueKey="pct"
          formatTooltip={(n) => String(n)}
        />
      </SlotRevealProvider>,
    );
    expect(queryByText("Over plan")).toBeNull();
    expect(queryByText("On plan (±10%)")).toBeNull();
  });
});

describe("varianceColorForRange", () => {
  // Under plan halfway through the month is just "not spent yet", not an
  // achievement — while the range is the running month alone those bars go grey
  // rather than claiming success (260803 user request). Over plan still counts:
  // spending past the budget this early is real.
  it("greys an UNDER-plan category while the range is this month alone", () => {
    expect(varianceColorForRange(-40, { runningMonthOnly: true })).toBe(
      "var(--muted-foreground)",
    );
    expect(varianceColorForRange(-5, { runningMonthOnly: true })).toBe(
      "var(--muted-foreground)",
    );
  });

  it("still bands an OVER-plan category in the running month", () => {
    expect(varianceColorForRange(40, { runningMonthOnly: true })).toBe(
      varianceColor(40),
    );
    expect(varianceColorForRange(5, { runningMonthOnly: true })).toBe(
      varianceColor(5),
    );
  });

  it("bands everything once the range reaches past the running month", () => {
    for (const pct of [-40, -5, 0, 5, 40])
      expect(varianceColorForRange(pct, { runningMonthOnly: false })).toBe(
        varianceColor(pct),
      );
  });
});

describe("OverviewDivergingBarChart colouring", () => {
  beforeAll(() => {
    // recharts needs a measurable box in happy-dom (same shim as charts.test).
    for (const [prop, value] of [
      ["offsetWidth", 400],
      ["offsetHeight", 240],
    ] as const)
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        value,
      });
    if (!("ResizeObserver" in globalThis))
      // @ts-expect-error minimal shim
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
  });

  const ROWS = [
    { name: "Food", pct: -40 },
    { name: "Rent", pct: 40 },
  ];

  const fills = (node: HTMLElement) =>
    [...node.querySelectorAll(".recharts-bar-rectangle path")].map((p) =>
      p.getAttribute("fill"),
    );

  it("bands each bar by default", () => {
    const { container } = render(
      <div style={{ width: 400, height: 240 }}>
        <OverviewDivergingBarChart
          data={ROWS}
          categoryKey="name"
          valueKey="pct"
        />
      </div>,
    );
    expect(fills(container)).toEqual([varianceColor(-40), varianceColor(40)]);
  });

  it("hands the colour decision to colorForPct when given one", () => {
    // This is the wire the running-month grey rule rides on (260803).
    const { container } = render(
      <div style={{ width: 400, height: 240 }}>
        <OverviewDivergingBarChart
          data={ROWS}
          categoryKey="name"
          valueKey="pct"
          colorForPct={(pct) =>
            varianceColorForRange(pct, { runningMonthOnly: true })
          }
        />
      </div>,
    );
    expect(fills(container)).toEqual([
      "var(--muted-foreground)", // under plan → grey
      varianceColor(40), // over plan → still banded
    ]);
  });
});
