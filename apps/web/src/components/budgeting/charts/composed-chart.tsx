"use client";

/**
 * composed-chart.tsx — themed vertical Composed chart (Bar + Line).
 *
 * A recharts VerticalComposedChart: categories on the Y axis, value on X, one
 * horizontal Bar series overlaid with a Line series across the same categories
 * (e.g. real-average bars + planned-average line). Shares the chart theme,
 * tooltip, and the bar chart's hover/tap-to-toggle interaction so it behaves
 * identically to <OverviewBarChart> on mobile.
 */
import { useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CHART_THEME,
  chartAxis,
  leftAlignedYTick,
  type ChartSeries,
} from "./chart-theme";
import { ChartTooltipContent } from "./chart-tooltip";

export function OverviewComposedChart({
  data,
  xKey,
  bar,
  line,
  height = 240,
  formatValue,
  formatTooltip,
  labelFormat,
}: {
  data: Array<Record<string, unknown>>;
  /** Category key — the Y axis (vertical layout). */
  xKey: string;
  /** The horizontal Bar series. */
  bar: ChartSeries;
  /** The overlaid Line series. */
  line: ChartSeries;
  height?: number;
  formatValue?: (n: number) => string;
  formatTooltip?: (n: number) => string;
  labelFormat?: (label: string | number) => string;
}) {
  // Hover/tap state — mirrors bar-chart.tsx: hover/touch shows + follows; a re-tap
  // of the already-open row dismisses; non-active bars dim to 0.3.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const pressStart = useRef<number | null>(null);
  const setActive = (v: number | null) => {
    activeRef.current = v;
    setActiveIndex(v);
  };
  const coerceIdx = (
    raw: number | string | null | undefined,
  ): number | null => {
    const n = raw == null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const barFill = bar.color ?? CHART_THEME.barAccent;
  const lineStroke = line.color ?? CHART_THEME.barAccent2;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        onMouseDown={() => {
          pressStart.current = activeRef.current;
        }}
        onMouseMove={(s: { activeTooltipIndex?: number | string | null }) => {
          setActive(coerceIdx(s?.activeTooltipIndex));
        }}
        onMouseLeave={() => setActive(null)}
        onClick={(s: { activeTooltipIndex?: number | string | null }) => {
          const idx = coerceIdx(s?.activeTooltipIndex);
          if (idx == null) return;
          if (idx === pressStart.current) setActive(null);
        }}
      >
        <CartesianGrid
          stroke={CHART_THEME.grid}
          strokeDasharray="3 3"
          horizontal={false}
          vertical
        />
        <XAxis type="number" tickFormatter={formatValue} {...chartAxis} />
        <YAxis
          type="category"
          dataKey={xKey}
          width={72}
          {...chartAxis}
          tick={leftAlignedYTick(72)}
        />
        <Tooltip
          active={activeIndex !== null}
          wrapperStyle={{ pointerEvents: "none" }}
          cursor={{ fill: CHART_THEME.grid, fillOpacity: 0.15 }}
          content={
            <ChartTooltipContent
              formatY={formatTooltip ?? formatValue}
              series={[bar, line]}
              labelFormat={labelFormat}
            />
          }
        />
        <Bar
          dataKey={bar.key}
          name={bar.label}
          fill={barFill}
          radius={[0, 4, 4, 0]}
          barSize={14}
          isAnimationActive={false}
        >
          {data.map((_, ri) => (
            <Cell
              key={ri}
              fill={barFill}
              fillOpacity={activeIndex === null || activeIndex === ri ? 1 : 0.3}
            />
          ))}
        </Bar>
        <Line
          dataKey={line.key}
          name={line.label}
          stroke={lineStroke}
          strokeWidth={2}
          dot={{ r: 3, fill: lineStroke, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
