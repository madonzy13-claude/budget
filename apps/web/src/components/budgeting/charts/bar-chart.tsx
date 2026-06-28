"use client";

/**
 * bar-chart.tsx — themed, responsive Bar wrapper (11-02).
 * Supports vertical layout (Y = category) for planned-avg-vs-real, overspent-by-
 * category, and reserves-by-category bars (11-09). Data-agnostic.
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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

export function OverviewBarChart({
  data,
  xKey,
  series,
  height = 240,
  layout = "horizontal",
  formatValue,
  colorByPoint,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  layout?: "horizontal" | "vertical";
  formatValue?: (n: number) => string;
  /** Single-series only: per-bar color (MoM up/down, per-category colorKey).
   *  Ignored for grouped (multi-series) bars. */
  colorByPoint?: (row: Record<string, unknown>) => string;
}) {
  const vertical = layout === "vertical";
  // Build axes as plain elements (no Fragment) — recharts inspects direct children.
  const xAxis = vertical ? (
    <XAxis type="number" tickFormatter={formatValue} {...chartAxis} />
  ) : (
    <XAxis type="category" dataKey={xKey} {...chartAxis} />
  );
  const yAxis = vertical ? (
    <YAxis type="category" dataKey={xKey} width={96} {...chartAxis} />
  ) : (
    <YAxis
      type="number"
      tickFormatter={formatValue}
      width={48}
      {...chartAxis}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          stroke={CHART_THEME.grid}
          strokeDasharray="3 3"
          horizontal={!vertical}
          vertical={vertical}
        />
        {xAxis}
        {yAxis}
        <Tooltip
          {...chartTooltip}
          cursor={{ fill: CHART_THEME.grid, fillOpacity: 0.15 }}
        />
        {series.map((s, si) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? CHART_THEME.accent}
            radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            isAnimationActive={false}
          >
            {colorByPoint && si === 0 && series.length === 1
              ? data.map((row, ri) => (
                  <Cell key={ri} fill={colorByPoint(row)} />
                ))
              : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
