"use client";

/**
 * overlap-bar-chart.tsx — themed vertical "bar-in-bar" chart.
 *
 * Two horizontal bar series drawn OVERLAID on the same category line (not grouped
 * side-by-side) so you can read how much they overlap: the `overlay` series sits
 * on top of `base` with a bit of transparency, so the shared region blends and
 * whichever bar is longer shows past the other. Used for planned-avg vs real-avg
 * by category. Shares the chart theme, tooltip, and the hover/tap-to-toggle
 * interaction of <OverviewBarChart>.
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
import { ChartTooltipContent } from "./chart-tooltip";

const BAR_SIZE = 16;

export function OverviewOverlapBarChart({
  data,
  xKey,
  base,
  overlay,
  overlayOpacity = 0.55,
  overlayColorByPoint,
  tooltipExtra,
  height = 240,
  formatValue,
  formatTooltip,
  labelFormat,
}: {
  data: Array<Record<string, unknown>>;
  /** Category key — the Y axis (vertical layout). */
  xKey: string;
  /** The solid bottom bar. */
  base: ChartSeries;
  /** The semi-transparent bar drawn on top of `base`. */
  overlay: ChartSeries;
  /** Fill opacity of the top (overlay) bar so the overlap shows through. */
  overlayOpacity?: number;
  /** Per-category fill for the overlay bar (a heat map by e.g. overspend %).
   *  Falls back to overlay.color / the theme accent when omitted. */
  overlayColorByPoint?: (row: Record<string, unknown>) => string;
  /** Extra tooltip summary rows (e.g. the difference amount + percent). */
  tooltipExtra?: (
    row: Record<string, unknown>,
  ) => Array<{ label: string; value: string; color?: string }>;
  height?: number;
  formatValue?: (n: number) => string;
  formatTooltip?: (n: number) => string;
  labelFormat?: (label: string | number) => string;
}) {
  // Hover/tap state — mirrors bar-chart.tsx.
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

  const baseFill = base.color ?? CHART_THEME.barAccent;
  const overlayFill = overlay.color ?? CHART_THEME.barAccent2;
  const dim = (ri: number, full: number) =>
    activeIndex === null || activeIndex === ri ? full : full * 0.3;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        // Negative barGap = the two series' bars collapse onto the same category
        // line instead of sitting side-by-side → overlaid (bar-in-bar).
        barGap={-BAR_SIZE}
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
              series={[base, overlay]}
              labelFormat={labelFormat}
              // Overlay row's marker uses the SAME per-category heat colour as its
              // bar; the base row falls back to its series colour.
              colorForRow={
                overlayColorByPoint
                  ? (row, key) =>
                      key === overlay.key ? overlayColorByPoint(row) : undefined
                  : undefined
              }
              extra={tooltipExtra}
            />
          }
        />
        {/* Bottom: solid base bar. */}
        <Bar
          dataKey={base.key}
          name={base.label}
          fill={baseFill}
          barSize={BAR_SIZE}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          {data.map((_, ri) => (
            <Cell key={ri} fill={baseFill} fillOpacity={dim(ri, 1)} />
          ))}
        </Bar>
        {/* Top: semi-transparent overlay bar so the overlap shows through.
            Per-category heat fill when overlayColorByPoint is supplied. */}
        <Bar
          dataKey={overlay.key}
          name={overlay.label}
          fill={overlayFill}
          barSize={BAR_SIZE}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        >
          {data.map((row, ri) => (
            <Cell
              key={ri}
              fill={overlayColorByPoint ? overlayColorByPoint(row) : overlayFill}
              fillOpacity={dim(ri, overlayOpacity)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
