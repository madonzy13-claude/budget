"use client";

/**
 * diverging-bar-chart.tsx — percent variance around a centre line (260731).
 *
 * Reads how far each category landed from its plan, NOT how much it spent: the
 * axis is % variance, zero sits in the middle, an over-spent category grows to the
 * RIGHT and an under-spent one to the LEFT. Everything inside ±10% is "on plan" —
 * shaded as a soft band around the centre so a near-perfect month reads as a
 * cluster in the middle instead of a row of meaningless stubs.
 *
 * Why percent: amounts made a €900 rent line dwarf a €40 coffee line even when the
 * coffee line was 3× its plan. Variance puts every category on one comparable
 * scale, which is what "over / under budget" actually asks.
 *
 * Colours follow the app's existing heat semantics (lib/overspend-heat):
 * over = trading-down red, under = brand yellow, on plan = trading-up green.
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
  ReferenceLine,
  ReferenceArea,
  LabelList,
  Tooltip,
} from "recharts";
import { CHART_THEME, chartAxis } from "./chart-theme";
import { CategoryTick } from "./category-tick";
import { ChartTooltipContent } from "./chart-tooltip";
import { useSlotReveal } from "@/components/budgeting/overview/slot-amount";

/** Half-width of the "close enough to plan" band, in percent. */
export const ON_PLAN_BAND_PCT = 10;
/** Outliers past this are clamped so one 900% category can't flatten the rest. */
const MAX_DOMAIN_PCT = 200;

const BAR_SIZE = 14;
const ROW_PX = 34;

export type VarianceBand = "over" | "under" | "on-plan";

export function varianceBand(pct: number): VarianceBand {
  if (pct > ON_PLAN_BAND_PCT) return "over";
  if (pct < -ON_PLAN_BAND_PCT) return "under";
  return "on-plan";
}

const BAND_COLOR: Record<VarianceBand, string> = {
  over: "var(--trading-down)",
  under: "var(--primary)",
  "on-plan": "var(--trading-up)",
};

/**
 * Symmetric [-max, max] domain: rounded outward to a tidy multiple of 10, never
 * tighter than twice the on-plan band (so a boring month still shows the band),
 * and capped at MAX_DOMAIN_PCT.
 */
export function divergingDomain(values: number[]): [number, number] {
  const biggest = values.reduce(
    (m, v) => (Number.isFinite(v) && Math.abs(v) > m ? Math.abs(v) : m),
    0,
  );
  const capped = Math.min(biggest, MAX_DOMAIN_PCT);
  // +15% headroom, rounded out to a tidy tick: a 98% bar that ends exactly on the
  // axis edge leaves nowhere to put its label.
  const rounded = Math.ceil((capped * 1.15) / 10) * 10;
  const max = Math.min(Math.max(rounded, ON_PLAN_BAND_PCT * 2), MAX_DOMAIN_PCT);
  return [-max, max];
}

const fmtPct = (n: number) => {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)}%`;
};

/**
 * Percent label pinned to the bar's outer end (right when over, left when under),
 * so it never lands on the category name of a left-growing bar.
 */
function VarianceLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: string | number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  const grewRight = width >= 0;
  // A long bar gets its label INSIDE its outer end (there may be no room left on
  // the outside, and on the left it would land on the category name); a short one
  // gets it just outside, where it reads better against the background.
  const inside = Math.abs(width) > 64;
  const end = x + width;
  const tx = inside ? end + (grewRight ? -8 : 8) : end + (grewRight ? 6 : -6);
  const anchor = inside
    ? grewRight
      ? "end"
      : "start"
    : grewRight
      ? "start"
      : "end";
  return (
    <text
      x={tx}
      y={y + height / 2}
      dy={4}
      textAnchor={anchor}
      fill={inside ? "var(--canvas-dark)" : CHART_THEME.axis}
      fontSize={11}
      fontWeight={inside ? 600 : 400}
      fontFamily={CHART_THEME.fontNumber}
    >
      {value}
    </text>
  );
}

export function OverviewDivergingBarChart({
  data,
  categoryKey,
  valueKey,
  labels,
  tooltipExtra,
  height = 240,
  formatTooltip,
  labelFormat,
  maskAmounts = false,
}: {
  data: Array<Record<string, unknown>>;
  /** Category name key — the Y axis. */
  categoryKey: string;
  /** Signed percent variance key — the X axis. */
  valueKey: string;
  /** Legend copy for the three bands. */
  labels: { over: string; under: string; onPlan: string };
  tooltipExtra?: (
    row: Record<string, unknown>,
  ) => Array<{ label: string; value: string; color?: string }>;
  height?: number;
  /** Money formatter for the tooltip rows (the axis itself is percent). */
  formatTooltip?: (n: number) => string;
  labelFormat?: (label: string | number) => string;
  /** Privacy: money inside the tooltip hides until the shared reveal. */
  maskAmounts?: boolean;
}) {
  const { revealed } = useSlotReveal();
  const hideAmt = maskAmounts && !revealed;
  const tipFmt = hideAmt ? () => "•••" : (formatTooltip ?? fmtPct);

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

  const values = data.map((r) => Number(r[valueKey]));
  const [min, max] = divergingDomain(values);
  // Clamp the DRAWN bar to the domain so a capped outlier still reaches the edge;
  // the label + tooltip keep showing its real percent.
  const rows = data.map((r) => {
    const pct = Number(r[valueKey]);
    const clamped = Math.max(
      min,
      Math.min(max, Number.isFinite(pct) ? pct : 0),
    );
    return { ...r, __pct: clamped, __raw: pct, __label: fmtPct(pct) };
  });

  const chartHeight = Math.max(height, rows.length * ROW_PX + 32);
  const dim = (ri: number) =>
    activeIndex === null || activeIndex === ri ? 1 : 0.3;

  return (
    <div className="flex flex-col gap-1">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 34, bottom: 0, left: 8 }}
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
          {/* The "close enough" corridor — read the centre as a target zone, not a
              hairline. Drawn before the bars so it sits underneath. */}
          <ReferenceArea
            x1={-ON_PLAN_BAND_PCT}
            x2={ON_PLAN_BAND_PCT}
            fill="var(--trading-up)"
            fillOpacity={0.08}
            strokeOpacity={0}
          />
          <XAxis
            type="number"
            domain={[min, max]}
            ticks={[min, min / 2, 0, max / 2, max]}
            tickFormatter={fmtPct}
            {...chartAxis}
          />
          <YAxis
            type="category"
            dataKey={categoryKey}
            width={72}
            {...chartAxis}
            tick={<CategoryTick width={72} />}
            interval={0}
          />
          {/* Zero line last among the references so it reads on top of the band. */}
          <ReferenceLine x={0} stroke={CHART_THEME.axis} strokeOpacity={0.6} />
          <Tooltip
            active={activeIndex !== null}
            wrapperStyle={{ pointerEvents: "none" }}
            cursor={{ fill: CHART_THEME.grid, fillOpacity: 0.15 }}
            content={
              <ChartTooltipContent
                formatY={tipFmt}
                series={[]}
                labelFormat={labelFormat}
                extra={tooltipExtra}
              />
            }
          />
          <Bar
            dataKey="__pct"
            barSize={BAR_SIZE}
            isAnimationActive={false}
            // Rounded on the growing end only — the bars start at the centre line.
            radius={4}
          >
            {rows.map((row, ri) => (
              <Cell
                key={ri}
                fill={BAND_COLOR[varianceBand(row.__raw)]}
                fillOpacity={dim(ri)}
              />
            ))}
            {/* The percent sits on the OUTER end of each bar: right for an
                over-spend, left for an under-spend. A fixed `position="right"`
                dropped the label of a left-growing bar straight onto the
                category name. */}
            <LabelList dataKey="__label" content={<VarianceLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Legend — the colours carry meaning, so name them once instead of making
          the user infer red/green. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[10px] text-[var(--muted-foreground)]">
        {(
          [
            ["over", labels.over],
            ["on-plan", labels.onPlan],
            ["under", labels.under],
          ] as const
        ).map(([band, label]) => (
          <span key={band} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: BAND_COLOR[band] }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
