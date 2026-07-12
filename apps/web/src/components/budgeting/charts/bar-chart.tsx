"use client";

/**
 * bar-chart.tsx — themed, responsive Bar wrapper (11-02).
 * Supports vertical layout (Y = category) for planned-avg-vs-real, overspent-by-
 * category, and reserves-by-category bars (11-09). Data-agnostic.
 */
import { useRef, useState } from "react";
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
  leftAlignedYTick,
  type ChartSeries,
} from "./chart-theme";
import { CategoryTick } from "./category-tick";
import { ChartTooltipContent } from "./chart-tooltip";

export function OverviewBarChart({
  data,
  xKey,
  series,
  height = 240,
  layout = "horizontal",
  formatValue,
  formatTooltip,
  colorByPoint,
  labelFormat,
  xTickFormat,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  layout?: "horizontal" | "vertical";
  formatValue?: (n: number) => string;
  /** Tooltip value formatter — the FULL value on tap; axis stays compact. Falls
   *  back to `formatValue` (round 25 item 2). */
  formatTooltip?: (n: number) => string;
  /** Single-series only: per-bar color (MoM up/down, per-category colorKey).
   *  Ignored for grouped (multi-series) bars. */
  colorByPoint?: (row: Record<string, unknown>) => string;
  /** Format the tooltip's category/x label (e.g. month number → month name). */
  labelFormat?: (label: string | number) => string;
  /** Format the category X-axis ticks (e.g. ISO date → "12 Feb 2026"). */
  xTickFormat?: (label: string | number) => string;
}) {
  const vertical = layout === "vertical";
  // Vertical (category) charts: scale height with the row count so 2-line wrapped
  // labels don't overlap in thin bands (UAT). Horizontal keeps the passed height.
  const chartHeight = vertical
    ? Math.max(height, data.length * 36 + 24)
    : height;
  // Which category is hovered/tapped — DIMs the others (round 18 item 5) AND drives
  // the tooltip's visibility. Round 19 item 2: a re-tap of the SAME bar hides it.
  // Implemented via a press-start ref (the active index BEFORE this press): the tap
  // shows via hover/touch-move like always (so a mobile tooltip never regresses),
  // and onClick only DISMISSES when you tapped the already-open bar.
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
  // Build axes as plain elements (no Fragment) — recharts inspects direct children.
  const xAxis = vertical ? (
    <XAxis type="number" tickFormatter={formatValue} {...chartAxis} />
  ) : (
    <XAxis
      type="category"
      dataKey={xKey}
      {...chartAxis}
      {...(xTickFormat ? { tickFormatter: xTickFormat } : {})}
    />
  );
  const yAxis = vertical ? (
    // 72 (was 96): category labels are short; the wider axis left an empty strip
    // on the left (UAT round 14 item 1). Left-aligned so labels line up with the
    // section header (round 16 item 2).
    <YAxis
      type="category"
      dataKey={xKey}
      width={72}
      {...chartAxis}
      tick={<CategoryTick width={72} />}
      interval={0}
    />
  ) : (
    <YAxis
      type="number"
      tickFormatter={formatValue}
      width={48}
      {...chartAxis}
      tick={leftAlignedYTick(48)}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        onMouseDown={() => {
          pressStart.current = activeRef.current; // what was open BEFORE this press
        }}
        onMouseMove={(s: { activeTooltipIndex?: number | string | null }) => {
          setActive(coerceIdx(s?.activeTooltipIndex)); // hover / touch shows + follows
        }}
        onMouseLeave={() => setActive(null)}
        onClick={(s: { activeTooltipIndex?: number | string | null }) => {
          const idx = coerceIdx(s?.activeTooltipIndex);
          if (idx == null) return;
          // Tapped the bar that was already open → hide; otherwise leave it shown.
          if (idx === pressStart.current) setActive(null);
        }}
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
          // Controlled so a re-tap hides it on touch (item 2); on desktop
          // activeIndex tracks hover, so this stays true while hovering.
          active={activeIndex !== null}
          // Pass-through so a tap ON the tooltip reaches the bar below → toggles.
          wrapperStyle={{ pointerEvents: "none" }}
          cursor={{ fill: CHART_THEME.grid, fillOpacity: 0.15 }}
          content={
            <ChartTooltipContent
              formatY={formatTooltip ?? formatValue}
              series={series}
              labelFormat={labelFormat}
              // Single-series per-point bars (up/down, per-category): the marker
              // matches the bar's own color, not the base fill (item 3).
              colorForRow={
                colorByPoint && series.length === 1 ? colorByPoint : undefined
              }
            />
          }
        />
        {series.map((s, si) => {
          const perPoint = colorByPoint && si === 0 && series.length === 1;
          // Bars are blue (2nd series in a two-series bar → teal); an explicit
          // series color (e.g. the dashed planned baseline) still wins (item 1).
          const baseFill =
            s.color ??
            (si === 0 ? CHART_THEME.barAccent : CHART_THEME.barAccent2);
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={baseFill}
              radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {/* Per-point Cells so the hovered/tapped bar stays full while the
                  others dim to 0.3 (round 18 item 5 — no outline). */}
              {data.map((row, ri) => (
                <Cell
                  key={ri}
                  fill={perPoint ? colorByPoint(row) : baseFill}
                  fillOpacity={
                    activeIndex === null || activeIndex === ri ? 1 : 0.3
                  }
                />
              ))}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
