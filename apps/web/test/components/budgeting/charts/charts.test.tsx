/**
 * charts.test.tsx — render smoke tests for the Phase-11 chart wrappers (11-02).
 *
 * happy-dom does not lay out, so recharts' ResponsiveContainer can report 0×0. We
 * shim element box size + ResizeObserver so the SVG has a chance to render, but the
 * assertions stay at smoke level (mounts without throwing) per the plan — NOT pixel
 * geometry, which recharts + happy-dom cannot measure.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewLineChart } from "@/components/budgeting/charts/line-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import {
  PIE_RING_INNER_PCT,
  PIE_SLICE_OUTER_PCT,
} from "../../../../src/components/budgeting/charts/pie-chart";
import {
  amountTicks,
  OverviewDivergingBarChart,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import { OverviewOverlapBarChart } from "@/components/budgeting/charts/overlap-bar-chart";
import { ChartTooltipContent } from "@/components/budgeting/charts/chart-tooltip";
import { SlotRevealProvider } from "@/components/budgeting/overview/slot-amount";

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

  it("renders an overlaid bar-in-bar chart without throwing", () => {
    const { container } = box(
      <OverviewOverlapBarChart
        data={[
          { name: "Groceries", real: 42000, planned: 38000 },
          { name: "Transport", real: 18000, planned: 20000 },
          { name: "Rent", real: 130000, planned: 130000 },
        ]}
        xKey="name"
        base={{ key: "real", label: "Real" }}
        overlay={{ key: "planned", label: "Planned" }}
      />,
    );
    expect(
      container.querySelector(".recharts-responsive-container"),
    ).toBeTruthy();
    // Two overlaid bar series render.
    expect(container.querySelectorAll(".recharts-bar").length).toBe(2);
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

  describe("Pie outer ring", () => {
    // The planned-spend pie grows a second ring outside it — needs / wants /
    // investing, summed across categories (260803 request). It is background:
    // it must not take the taps the category slices inside it rely on.
    const RING = [
      { name: "Needs", value: 60 },
      { name: "Wants", value: 30 },
    ];

    // The ring sat 6 points off the slices, so a selected slice (which grows)
    // touched it — user, 260803: "add a bit more space between inner and outer".
    it("leaves a visible gap between the slices and the ring", () => {
      expect(PIE_RING_INNER_PCT - PIE_SLICE_OUTER_PCT).toBeGreaterThanOrEqual(
        10,
      );
    });

    it("renders nothing extra when no ring is given", () => {
      const { container } = box(
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
        />,
      );
      expect(container.querySelectorAll(".recharts-pie").length).toBe(1);
    });

    it("renders the ring as a second pie outside the first", () => {
      const { container } = box(
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          outerRing={{ data: RING, colorFor: () => "#6b7280" }}
        />,
      );
      expect(container.querySelectorAll(".recharts-pie").length).toBe(2);
    });

    /** Tap a specific sector by pointing elementFromPoint at it. */
    const tapSector = (container: HTMLElement, sector: Element) => {
      const spy = vi
        .spyOn(document, "elementFromPoint")
        .mockReturnValue(sector as Element);
      const wrap = container.querySelector(".relative") as HTMLElement;
      act(() => fireEvent.pointerUp(wrap, { clientX: 1, clientY: 1 }));
      spy.mockRestore();
    };

    const centreText = (container: HTMLElement) =>
      (container.querySelector(".relative")?.textContent ?? "").replace(
        /\s+/g,
        " ",
      );

    it("selects the CATEGORY tapped, counting sectors within its own pie", () => {
      // Both pies put `.recharts-sector` in the DOM, and the ring renders first
      // — indexing across all of them offset every category by the ring's size,
      // so tapping the first slice read out the third.
      const { container } = box(
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          outerRing={{ data: RING, colorFor: () => "#6b7280" }}
        />,
      );
      const pies = container.querySelectorAll(".recharts-pie");
      const main = pies[pies.length - 1]!;
      const first = main.querySelectorAll(".recharts-sector")[0]!;
      tapSector(container, first);
      expect(centreText(container)).toContain("Groceries");
    });

    it("selects a RING arc and reads out its name, amount and share", () => {
      const { container } = box(
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          formatValue={(n) => `${n} zl`}
          outerRing={{ data: RING, colorFor: () => "#6b7280" }}
        />,
      );
      // The ring renders first, so it is pie 0; its arcs also carry the sector
      // testid recharts forwards onto them.
      const ring = container.querySelectorAll(".recharts-pie")[0]!;
      const needs = ring.querySelectorAll(".recharts-sector")[0]!;
      tapSector(container, needs);
      const text = centreText(container);
      expect(text).toContain("Needs");
      expect(text).toContain("60 zl");
      expect(text).toContain("67%"); // 60 of the ring's 90
    });

    it("marks the ring so its sectors can be told from the pie's", () => {
      const { container } = box(
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          outerRing={{ data: RING, colorFor: () => "#6b7280" }}
        />,
      );
      // The ring is pie 0 and holds exactly its own arcs; the categories are
      // pie 1. Indexing across BOTH is what offset every slice (260803).
      const pies = container.querySelectorAll(".recharts-pie");
      expect(pies[0]!.querySelectorAll(".recharts-sector").length).toBe(
        RING.length,
      );
      expect(pies[1]!.querySelectorAll(".recharts-sector").length).toBe(
        byCategory.length,
      );
      // Each arc is individually addressable for the tap handler.
      expect(
        container.querySelectorAll('[data-testid="pie-ring-sector"]').length,
      ).toBe(RING.length);
    });
  });

  describe("ChartTooltipContent geometry rows", () => {
    const rowFor = (geometry: Record<string, unknown>) => [
      {
        dataKey: "real",
        value: 500,
        name: "Spent",
        color: "var(--chart-bar-1)",
        payload: { label: "2026-07-31", real: 500, ...geometry },
      },
    ];
    const renderTip = (geometry: Record<string, unknown>) =>
      render(
        <ChartTooltipContent
          active
          payload={rowFor(geometry)}
          label="2026-07-31"
          series={[{ key: "real", label: "Spent" }]}
        />,
      ).container;

    it("answers on a month's CLOSING total", () => {
      // It is the last day's reading, moved onto the boundary — not geometry.
      // Silencing it left the end of every month unanswerable (user report,
      // 260802: "no tooltip is shown in the end").
      expect(renderTip({}).textContent).not.toBe("");
    });

    it("answers on the point a month OPENS with", () => {
      // Zero spent so far is still a reading. Silencing it left a step the
      // pointer lands on with nothing behind it (user report, 260802: "two
      // steps, one with tooltip and one is without").
      expect(
        renderTip({ reset: true, drop: true, real: 0 }).textContent,
      ).not.toBe("");
    });

    it("stays silent only where every series is null", () => {
      // The plan tail past the last reading: nothing to say at all.
      const { container } = render(
        <ChartTooltipContent
          active
          payload={[
            {
              dataKey: "real",
              value: null,
              name: "Spent",
              payload: { label: "2026-08-10", real: null },
            },
          ]}
          label="2026-08-10"
          series={[{ key: "real", label: "Spent" }]}
        />,
      );
      expect(container.textContent).toBe("");
    });
  });

  describe("ChartTooltipContent extra columns", () => {
    // "How far off plan, by category" shows the range AVERAGE and the range
    // TOTAL side by side (260803 user request), so an extra row carries a second
    // value and the list can open with a header naming the two columns.
    const renderExtra = (
      rows: Parameters<typeof ChartTooltipContent>[0]["extra"],
    ) =>
      render(
        <ChartTooltipContent
          active
          payload={[
            { dataKey: "pct", value: 10, name: "Change", payload: { pct: 10 } },
          ]}
          label="Food"
          series={[{ key: "pct", label: "Change" }]}
          hideSeriesRows
          extra={rows}
        />,
      ).container;

    it("renders a row's second value alongside the first", () => {
      const c = renderExtra(() => [
        { label: "Planned", value: "50 zl", value2: "200 zl" },
      ]);
      expect(c.textContent).toContain("50 zl");
      expect(c.textContent).toContain("200 zl");
    });

    // 260803: the column names used to occupy a whole row of their own; they
    // belong to the title line, beside the category name.
    it("puts the column names on the title line, not a row of their own", () => {
      const c = renderExtra(() => [
        { label: "", value: "avg", value2: "total", head: true },
        { label: "Planned", value: "50 zl", value2: "200 zl" },
      ]);
      const title = c.querySelector('[data-testid="tooltip-title"]')!;
      expect(title.textContent).toContain("Food");
      expect(title.textContent).toContain("avg");
      expect(title.textContent).toContain("total");
      // and no separate head row survives below it
      expect(
        c.querySelectorAll('[data-testid="tooltip-extra-row"]').length,
      ).toBe(1);
    });

    // The totals are context for the averages the bar is drawn from — they read
    // quieter so the eye lands on the avg column first (user, 260803).
    it("renders the total column quieter than the average", () => {
      const c = renderExtra(() => [
        { label: "Planned", value: "50 zl", value2: "200 zl" },
      ]);
      const cells = [...c.querySelectorAll("span")].filter((n) =>
        ["50 zl", "200 zl"].includes(n.textContent ?? ""),
      );
      const avg = cells.find((n) => n.textContent === "50 zl")!;
      const total = cells.find((n) => n.textContent === "200 zl")!;
      expect(total.style.color).not.toBe("");
      expect(total.style.color).not.toBe(avg.style.color);
    });

    // A section of its own: the difference is a conclusion, not another figure
    // in the same list (user, 260803).
    it("separates a section row with its own rule", () => {
      const c = renderExtra(() => [
        { label: "Planned", value: "50 zl", value2: "200 zl" },
        { label: "Difference", value: "+12%", section: true },
      ]);
      const rows = [...c.querySelectorAll('[data-testid="tooltip-extra-row"]')];
      const diff = rows.find((r) => r.textContent?.includes("Difference"))!;
      expect((diff as HTMLElement).style.borderTop).not.toBe("");
    });

    it("leaves a one-value row exactly as it was", () => {
      const c = renderExtra(() => [{ label: "Difference", value: "+12%" }]);
      expect(c.textContent).toContain("Difference");
      expect(c.textContent).toContain("+12%");
    });
  });

  describe("ChartTooltipContent marker color (r25 item 3)", () => {
    const payload = [
      {
        dataKey: "pct",
        value: 10,
        name: "Change",
        color: "var(--chart-bar-1)", // recharts base fill (blue) — must NOT win
        payload: { label: "d", pct: 10, raw: 10 },
      },
    ];

    it("uses the per-point colorForRow so the marker matches the bar, not the base fill", () => {
      const { container } = render(
        <ChartTooltipContent
          active
          payload={payload}
          label="d"
          series={[{ key: "pct", label: "Change" }]}
          colorForRow={(row) =>
            Number(row.pct) >= 0 ? "rgb(14, 203, 129)" : "rgb(246, 70, 93)"
          }
        />,
      );
      const marker = container.querySelector(
        "span[aria-hidden]",
      ) as HTMLElement;
      expect(marker).toBeTruthy();
      expect(marker.getAttribute("style") || "").toMatch(/14,\s*203,\s*129/);
    });

    it("colorForRow can target ONE series by dataKey (heat overlay), leaving the other at its series color", () => {
      const twoRows = [
        {
          dataKey: "planned",
          value: 20000,
          name: "Planned",
          color: "teal",
          payload: { pct: 1194 },
        },
        {
          dataKey: "real",
          value: 258800,
          name: "Real",
          color: "teal",
          payload: { pct: 1194 },
        },
      ];
      const { container } = render(
        <ChartTooltipContent
          active
          payload={twoRows}
          label="Dining"
          series={[
            { key: "planned", label: "Planned", color: "rgb(9, 9, 9)" },
            { key: "real", label: "Real" },
          ]}
          // Only the "real" row gets the heat colour; "planned" returns undefined
          // → falls back to its grey series colour.
          colorForRow={(row, key) =>
            key === "real"
              ? Number(row.pct) > 25
                ? "rgb(246, 70, 93)"
                : "rgb(14, 203, 129)"
              : undefined
          }
        />,
      );
      const markers = container.querySelectorAll("span[aria-hidden]");
      expect(markers.length).toBe(2);
      // planned marker → grey series color; real marker → red heat color.
      expect((markers[0] as HTMLElement).getAttribute("style") || "").toMatch(
        /9,\s*9,\s*9/,
      );
      expect((markers[1] as HTMLElement).getAttribute("style") || "").toMatch(
        /246,\s*70,\s*93/,
      );
    });

    it("falls back to the series color when no colorForRow is given", () => {
      const { container } = render(
        <ChartTooltipContent
          active
          payload={payload}
          label="d"
          series={[{ key: "pct", label: "Change", color: "rgb(1, 2, 3)" }]}
        />,
      );
      const marker = container.querySelector(
        "span[aria-hidden]",
      ) as HTMLElement;
      expect(marker.getAttribute("style") || "").toMatch(/1,\s*2,\s*3/);
    });

    it("renders extra summary rows (difference amount + percent) below the series", () => {
      const { getByText } = render(
        <ChartTooltipContent
          active
          payload={[
            {
              dataKey: "real",
              value: 258800,
              name: "Real",
              payload: { real: 258800, planned: 20000, pct: 1194 },
            },
          ]}
          label="Dining"
          series={[{ key: "real", label: "Real" }]}
          extra={() => [
            {
              label: "Difference",
              value: "+$2,388 · +1194%",
              color: "rgb(1, 2, 3)",
            },
          ]}
        />,
      );
      expect(getByText("Difference")).toBeTruthy();
      expect(getByText("+$2,388 · +1194%")).toBeTruthy();
    });

    it("reports a tap to onDismiss and hides when its label is suppressed (r28 item 3)", () => {
      let dismissed: unknown = undefined;
      const { container, rerender } = render(
        <ChartTooltipContent
          active
          payload={payload}
          label="d"
          series={[{ key: "pct", label: "Change" }]}
          onDismiss={(l) => {
            dismissed = l;
          }}
        />,
      );
      // visible → tapping the tooltip reports its x-label
      const root = container.firstElementChild as HTMLElement;
      expect(root).toBeTruthy();
      fireEvent.click(root);
      expect(dismissed).toBe("d");
      // once that label is suppressed, the tooltip renders nothing
      rerender(
        <ChartTooltipContent
          active
          payload={payload}
          label="d"
          series={[{ key: "pct", label: "Change" }]}
          suppressedLabel="d"
          onDismiss={() => {}}
        />,
      );
      expect(container.firstElementChild).toBeNull();
    });
  });

  it("pointer-up in the masked pie CENTRE reveals the amount (iOS-safe; no click)", () => {
    // iOS Safari never fires `click` on the re-rendering chart, so the pie drives
    // the reveal from pointer-up. Centre of the shimmed 400×240 box = (200,120);
    // dist 0 ≤ 0.55·min/2 → the "centre" branch → toggle reveal.
    vi.useFakeTimers();
    const { container } = box(
      <SlotRevealProvider>
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          maskValue
          formatValue={(n) => `$${n}`}
        />
      </SlotRevealProvider>,
    );
    const slot = container.querySelector(
      '[data-testid="slot-amount"]',
    ) as HTMLElement;
    const wrap = container.querySelector(".relative") as HTMLElement;
    expect(slot.dataset.revealed).toBe("false");
    act(() => fireEvent.pointerUp(wrap, { clientX: 200, clientY: 120 }));
    act(() => vi.runAllTimers()); // settle the scramble
    expect(slot.dataset.revealed).toBe("true"); // revealed, NOT reset
    vi.useRealTimers();
  });

  it("masked pie centre amount is its OWN tap target (a wide amount's overflow can't fall through to a slice)", () => {
    const { container } = box(
      <SlotRevealProvider>
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          maskValue
          formatValue={(n) => `$${n}`}
        />
      </SlotRevealProvider>,
    );
    const slot = container.querySelector(
      '[data-testid="slot-amount"]',
    ) as HTMLElement;
    // The amount's wrapper must NOT disable pointer events: a value wider than the
    // donut hole overflows onto the ring, and a pointer-events-none amount let those
    // overflow taps fall THROUGH to the sector underneath (recharts then re-selected
    // the slice instead of toggling the blur — the reported bug).
    const wrapper = slot.parentElement as HTMLElement;
    expect(wrapper.className).toContain("pointer-events-auto");
    expect(wrapper.className).not.toContain("pointer-events-none");
  });

  it("pointer-up whose target is the masked AMOUNT reveals it (overflow tap = reveal, not select)", () => {
    // A wide amount overflows the hole onto the ring; a pointer-up whose target is
    // the amount is treated as a reveal (the `onAmount` branch) regardless of the
    // radius, so an overflow tap can't be mistaken for a slice select.
    vi.useFakeTimers();
    const { container } = box(
      <SlotRevealProvider>
        <OverviewPieChart
          data={byCategory}
          nameKey="name"
          valueKey="value"
          colorFor={() => "#4ea1ff"}
          maskValue
          formatValue={(n) => `$${n}`}
        />
      </SlotRevealProvider>,
    );
    const slot = container.querySelector(
      '[data-testid="slot-amount"]',
    ) as HTMLElement;
    expect(slot.dataset.revealed).toBe("false");
    // Fire on the amount (bubbles to the wrapper's onPointerUp with target=slot),
    // off-centre coords → the reveal must come from the target check, not radius.
    act(() => fireEvent.pointerUp(slot, { clientX: 380, clientY: 120 }));
    act(() => vi.runAllTimers());
    expect(slot.dataset.revealed).toBe("true");
    vi.useRealTimers();
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

  describe("Tooltip rows that say nothing", () => {
    const series = [
      { key: "needs", label: "Needs", hideWhenZero: true },
      { key: "wants", label: "Wants", hideWhenZero: true },
    ];
    const payload = (needs: number, wants: number) => [
      { dataKey: "needs", name: "Needs", value: needs, payload: {} },
      { dataKey: "wants", name: "Wants", value: wants, payload: {} },
    ];

    it("drops a band whose value is zero", () => {
      const { queryByText, getByText } = render(
        <ChartTooltipContent
          active
          payload={payload(600, 0)}
          series={series}
        />,
      );
      expect(getByText("Needs")).toBeTruthy();
      expect(queryByText("Wants")).toBeNull();
    });

    it("keeps both when both carry a figure", () => {
      const { getByText } = render(
        <ChartTooltipContent
          active
          payload={payload(600, 400)}
          series={series}
        />,
      );
      expect(getByText("Needs")).toBeTruthy();
      expect(getByText("Wants")).toBeTruthy();
    });

    it("leaves series that did not ask for it alone", () => {
      const { getByText } = render(
        <ChartTooltipContent
          active
          payload={payload(0, 0)}
          series={[
            { key: "needs", label: "Needs" },
            { key: "wants", label: "Wants" },
          ]}
        />,
      );
      expect(getByText("Needs")).toBeTruthy();
      expect(getByText("Wants")).toBeTruthy();
    });
  });
});

// 260804: both diverging charts can be read in money instead of percent — a
// member sizing a reserve wants to know it is 1,900 zł fat, not 240% fat. The
// ticks then have to come from the data's own magnitude rather than the percent
// ladder, and still include zero, which the whole chart is built around.
describe("amountTicks", () => {
  it("always includes the zero line", () => {
    expect(amountTicks(-500, 900)).toContain(0);
  });

  it("uses round steps that cover both ends", () => {
    const ticks = amountTicks(-40000, 90000);
    expect(ticks[0]).toBeLessThanOrEqual(-40000);
    expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(90000);
    // Evenly spaced on a round step (25k → 25k, 50k, 75k), never 3,700-shaped.
    const step = Math.min(...ticks.filter((t) => t > 0));
    const mantissa = step / 10 ** Math.floor(Math.log10(step));
    expect([1, 2, 2.5, 5]).toContain(Number(mantissa.toFixed(1)));
    for (const t of ticks) expect(Math.abs(t) % step).toBe(0);
  });

  it("stays sane when everything is on one side of zero", () => {
    const ticks = amountTicks(0, 250);
    expect(ticks).toContain(0);
    expect(ticks[ticks.length - 1]!).toBeGreaterThanOrEqual(250);
  });

  it("survives a flat chart where every value is zero", () => {
    expect(amountTicks(0, 0)).toEqual([0]);
  });

  it("does not run away on a huge spread", () => {
    expect(amountTicks(-1, 5_000_000).length).toBeLessThanOrEqual(12);
  });
});

describe("Diverging chart — money reading", () => {
  const ROWS = [
    { name: "Car", pct: 240, gap: 190000 },
    { name: "Food", pct: -50, gap: -32000 },
  ];

  const renderChart = (extra: Record<string, unknown> = {}) =>
    render(
      <div style={{ width: 600, height: 400 }}>
        <OverviewDivergingBarChart
          data={ROWS}
          categoryKey="name"
          valueKey="pct"
          {...extra}
        />
      </div>,
    ).container;

  it("labels the bars in percent by default", () => {
    const c = renderChart();
    expect(c.textContent).toContain("+240%");
    expect(c.textContent).toContain("−50%");
  });

  it("labels them with the caller's formatter when reading money", () => {
    const c = renderChart({
      valueKey: "gap",
      formatValue: (n: number) => `${Math.round(n / 100)} zl`,
    });
    expect(c.textContent).toContain("1900 zl");
    expect(c.textContent).toContain("-320 zl");
    expect(c.textContent).not.toContain("%");
  });

  it("drops the on-plan band in money, where ±10% means nothing", () => {
    const pct = renderChart();
    const money = renderChart({
      valueKey: "gap",
      formatValue: (n: number) => String(n),
    });
    const bands = (el: HTMLElement) =>
      el.querySelectorAll(".recharts-reference-area").length;
    expect(bands(pct)).toBeGreaterThan(0);
    expect(bands(money)).toBe(0);
  });
});
