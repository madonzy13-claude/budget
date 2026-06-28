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
  type ChartSeries,
} from "./chart-theme";

export function OverviewLineChart({
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
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid
          stroke={CHART_THEME.grid}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis dataKey={xKey} {...chartAxis} />
        <YAxis tickFormatter={formatY} width={48} {...chartAxis} />
        <Tooltip {...chartTooltip} />
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
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
