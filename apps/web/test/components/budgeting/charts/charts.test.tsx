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
});
