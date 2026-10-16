"use client";

/**
 * line-chart.tsx — themed, responsive Line wrapper (11-02).
 * Used for the daily-cumulative + Planned-vs-Real timelines (11-09). Data-agnostic.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CHART_THEME,
  chartAxis,
  chartTooltip,
  leftAlignedYTick,
  type ChartSeries,
} from "./chart-theme";
import { ChartTooltipContent } from "./chart-tooltip";
import { useEffect, useRef, useState } from "react";
import { useDismissTooltip } from "./use-dismiss-tooltip";
import { clampAnchorX, TOOLTIP_MAX_PX } from "@/lib/chart-tooltip-anchor";

export function OverviewLineChart({
  data,
  xKey,
  series,
  height = 240,
  formatY,
  formatTooltip,
  xTickFormat,
  labelFormat,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  formatY?: (n: number) => string;
  /** Tooltip value formatter — the FULL value on tap; axis stays compact (item 2). */
  formatTooltip?: (n: number) => string;
  /** Format the X-axis ticks (e.g. ISO date → "12 Feb 2026"). */
  xTickFormat?: (label: string | number) => string;
  /** Format the tooltip's X label (defaults to xTickFormat). */
  labelFormat?: (label: string | number) => string;
}) {
  // Measured so the anchor can be pulled back from the right edge.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [plotW, setPlotW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setPlotW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tipW = Math.min(
    TOOLTIP_MAX_PX,
    typeof window === "undefined" ? TOOLTIP_MAX_PX : window.innerWidth - 32,
  );

  const { chartProps, tooltipProps, contentExtra, hideCursor, anchor } =
    useDismissTooltip();
  return (
    <div ref={wrapRef} className="w-full">
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        {...chartProps}
      >
        <CartesianGrid
          stroke={CHART_THEME.grid}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey={xKey}
          {...chartAxis}
          {...(xTickFormat ? { tickFormatter: xTickFormat } : {})}
        />
        <YAxis
          tickFormatter={formatY}
          width={48}
          {...chartAxis}
          tick={leftAlignedYTick(48)}
        />
        <Tooltip
          {...tooltipProps}
          // Under the point and inside the plot — the same rule the area and
          // bar charts follow, so no tooltip reaches up over the sticky range
          // band above the chart (user, 261016).
          {...(anchor
            ? {
                position: {
                  x: clampAnchorX(anchor.x, plotW, tipW),
                  y: anchor.y,
                },
              }
            : {})}
          cursor={hideCursor ? false : chartTooltip.cursor}
          content={
            <ChartTooltipContent
              formatY={formatTooltip ?? formatY}
              series={series}
              labelFormat={labelFormat ?? xTickFormat}
              {...contentExtra}
            />
          }
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? CHART_THEME.accent}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            dot={false}
            activeDot={hideCursor || s.noActiveDot ? false : undefined}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
