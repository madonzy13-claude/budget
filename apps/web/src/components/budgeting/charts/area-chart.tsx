"use client";

/**
 * area-chart.tsx — themed, responsive Area wrapper (11-02).
 * Client component (ResponsiveContainer → ResizeObserver). Data-agnostic: takes
 * already-shaped data + series descriptors; 11-09 wires the data.
 */
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { useDismissTooltip } from "./use-dismiss-tooltip";

export function OverviewAreaChart({
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
  const { chartProps, tooltipProps, contentExtra, hideCursor } =
    useDismissTooltip();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
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
        {series.map((s) => {
          const color = s.color ?? CHART_THEME.accent;
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              dot={false}
              activeDot={hideCursor ? false : undefined}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
