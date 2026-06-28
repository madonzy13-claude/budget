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
  type ChartSeries,
} from "./chart-theme";

export function OverviewAreaChart({
  data,
  xKey,
  series,
  height = 240,
  formatY,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  formatY?: (n: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          stroke={CHART_THEME.grid}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis dataKey={xKey} {...chartAxis} />
        <YAxis tickFormatter={formatY} width={48} {...chartAxis} />
        <Tooltip {...chartTooltip} />
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
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
