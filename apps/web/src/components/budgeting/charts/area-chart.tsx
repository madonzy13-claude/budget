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
  maskAmounts = false,
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
  /** Privacy: when true, blur the Y-axis amounts + mask the tooltip amount until
   *  the shared SlotAmount reveal is toggled on (amounts only — dates stay). */
  maskAmounts?: boolean;
}) {
  const { chartProps, tooltipProps, contentExtra, hideCursor } =
    useDismissTooltip();
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
          {...chartAxis}
          {...(xTickFormat ? { tickFormatter: xTickFormat } : {})}
        />
        <YAxis
          tickFormatter={yFmt}
          width={48}
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
              labelFormat={labelFormat ?? xTickFormat}
              extra={tooltipExtra}
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
              stackId={s.stack}
              stroke={color}
              fill={color}
              fillOpacity={s.fillOpacity ?? 0.15}
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
