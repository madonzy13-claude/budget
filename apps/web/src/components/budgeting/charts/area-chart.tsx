"use client";

/**
 * area-chart.tsx — themed, responsive Area wrapper (11-02).
 * Client component (ResponsiveContainer → ResizeObserver). Data-agnostic: takes
 * already-shaped data + series descriptors; 11-09 wires the data.
 */
import { useId } from "react";
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
import { thinTimeTicks } from "@/lib/chart-ticks";
import { useSlotReveal } from "@/components/budgeting/overview/slot-amount";
import { cn } from "@/lib/utils";

/** A fixed 3-dot mask — hides the amount entirely (magnitude, K/M suffix, and
 *  all) with a constant width regardless of the real number. */
const AMOUNT_MASK = "•••";

export function OverviewAreaChart({
  data,
  xKey,
  series,
  height = 240,
  formatY,
  formatTooltip,
  xTickFormat,
  labelFormat,
  tooltipExtra,
  rowSuffix,
  summary,
  maskAmounts = false,
  tooltipOmitKeys,
  tooltipColorForRow,
  overlay,
  xNumeric = false,
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
  /** Extra tooltip rows appended below the series (e.g. a payment breakdown). */
  tooltipExtra?: (
    row: Record<string, unknown>,
  ) => Array<{ label: string; value: string; color?: string }>;
  /** Per-series-row SUFFIX after the value (e.g. each series' % share) so the
   *  amount and % read on ONE tooltip line — same layout as the bar chart. */
  rowSuffix?: (
    row: Record<string, unknown>,
    dataKey?: string | number,
  ) => string | string[] | undefined;
  /** Grid-aligned summary row (e.g. Total) below a hairline. */
  summary?: (
    row: Record<string, unknown>,
  ) => { label: string; value: string; suffix?: string[] } | null;
  /** Privacy: when true, blur the Y-axis amounts + mask the tooltip amount until
   *  the shared SlotAmount reveal is toggled on (amounts only — dates stay). */
  maskAmounts?: boolean;
  /** dataKeys that are VISUAL overlays only (e.g. a re-coloured stretch of an
   *  existing line) — they must not add a duplicate tooltip row. */
  tooltipOmitKeys?: string[];
  /** Per-point colour for a tooltip row (e.g. the actual row turning red once
   *  the point is past the plan). */
  tooltipColorForRow?: (
    row: Record<string, unknown>,
    dataKey?: string | number,
  ) => string | undefined;
  /** Extra recharts children (e.g. a <Customized> overlay) drawn LAST, on top of
   *  the series — used by the planned chart to stroke the actual line per zone. */
  overlay?: React.ReactNode;
  /**
   * 260801: treat `xKey` as a NUMBER (epoch ms) instead of a category, so points
   * are spaced by real elapsed time. A category axis gave the one-day step into a
   * running month the same width as the thirty days before it.
   */
  xNumeric?: boolean;
}) {
  const { chartProps, tooltipProps, contentExtra, hideCursor } =
    useDismissTooltip();
  // Unique per chart instance — several charts can live on one page.
  const gradIdBase = useId().replace(/:/g, "");
  const { revealed } = useSlotReveal();
  const hidden = maskAmounts && !revealed;
  // When hidden, both the Y-axis ticks and the tooltip value become "•••" (the
  // CSS blur below still applies on top). Fixed mask → the whole magnitude + any
  // K/M suffix are gone.
  const tooltipFmt = hidden ? () => AMOUNT_MASK : (formatTooltip ?? formatY);
  const yFmt = hidden ? () => AMOUNT_MASK : formatY;
  const chart = (
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
          {...(xNumeric
            ? {
                type: "number" as const,
                domain: ["dataMin", "dataMax"] as [string, string],
                // Ticks ON the data points — a plain numeric axis would invent
                // round-number dates nothing sits on. Rows flagged `reset` are
                // geometry (a drop back to zero), not readings, so they get no
                // tick; the rest are thinned by TIME because recharts drew a
                // daily range's every point and the labels overlapped.
                ticks: thinTimeTicks(
                  data.filter((d) => !d.reset).map((d) => Number(d[xKey])),
                ),
                interval: "preserveStartEnd" as const,
                // recharts drops ticks that would land within this many pixels
                // of their neighbour — its own width-aware pass on top of the
                // time thinning above, which cannot know the rendered width.
                minTickGap: 16,
              }
            : {})}
          {...chartAxis}
          {...(xTickFormat ? { tickFormatter: xTickFormat } : {})}
        />
        <YAxis
          tickFormatter={yFmt}
          width={48}
          // 260801: a series sitting at 0 is drawn ON the baseline, so half its
          // 2px stroke painted BELOW the axis. 2px of bottom padding lifts the
          // zero line just clear of it without shifting the readable scale.
          padding={{ bottom: 2 }}
          {...chartAxis}
          tick={leftAlignedYTick(48)}
        />
        <Tooltip
          {...tooltipProps}
          cursor={hideCursor ? false : chartTooltip.cursor}
          content={
            <ChartTooltipContent
              formatY={tooltipFmt}
              series={series}
              omitKeys={tooltipOmitKeys}
              colorForRow={tooltipColorForRow}
              labelFormat={labelFormat ?? xTickFormat}
              extra={tooltipExtra}
              rowSuffix={rowSuffix}
              summary={summary}
              {...contentExtra}
            />
          }
        />
        {/* Hard-stop stroke gradients (one per series that asks for it). */}
        {series.some((s) => s.strokeGradientStops?.length) && (
          <defs>
            {series
              .filter((s) => s.strokeGradientStops?.length)
              .map((s) => (
                <linearGradient
                  key={s.key}
                  id={`${gradIdBase}-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  {s.strokeGradientStops!.map((stop, i) => (
                    <stop
                      key={i}
                      offset={`${Math.round(stop.offset * 10000) / 100}%`}
                      stopColor={stop.color}
                    />
                  ))}
                </linearGradient>
              ))}
          </defs>
        )}
        {series.map((s) => {
          const color = s.color ?? CHART_THEME.accent;
          const stroke = s.strokeGradientStops?.length
            ? `url(#${gradIdBase}-${s.key})`
            : color;
          return (
            <Area
              key={s.key}
              type={s.curve ?? "monotone"}
              dataKey={s.key}
              name={s.label}
              stackId={s.stack}
              stroke={stroke}
              fill={color}
              fillOpacity={s.fillOpacity ?? 0.15}
              strokeOpacity={s.strokeOpacity ?? 1}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              dot={false}
              activeDot={hideCursor ? false : undefined}
              isAnimationActive={false}
            />
          );
        })}
        {overlay}
      </AreaChart>
    </ResponsiveContainer>
  );
  // Blur only the Y-axis amount ticks when hidden (dates on the X-axis stay
  // sharp). transition matches the SlotAmount reveal feel.
  return (
    <div
      className={cn(
        "[&_.recharts-yAxis]:transition-[filter] [&_.recharts-yAxis]:duration-500",
        hidden && "[&_.recharts-yAxis]:blur-[5px]",
      )}
    >
      {chart}
    </div>
  );
}
