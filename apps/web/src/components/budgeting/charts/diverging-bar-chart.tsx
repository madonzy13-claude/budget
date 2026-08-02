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
  Rectangle,
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
const BAR_SIZE = 14;
const ROW_PX = 34;
/** Axis padding (share of the span) so the outermost percent label has room. */
const AXIS_PAD = 0.12;

export type VarianceBand = "on-plan" | "drift" | "off";

/** Second band edge: past this, a category is treated as genuinely off plan. */
export const OFF_PLAN_BAND_PCT = 30;

/**
 * Colour band by MAGNITUDE, not direction (260731 user decision): being 50% under
 * plan is as much a planning miss as being 50% over, so both go red. Green ≤10%,
 * yellow ≤30%, red beyond.
 */
export function varianceBand(pct: number): VarianceBand {
  const off = Math.abs(pct);
  if (off <= ON_PLAN_BAND_PCT) return "on-plan";
  if (off <= OFF_PLAN_BAND_PCT) return "drift";
  return "off";
}

const BAND_COLOR: Record<VarianceBand, string> = {
  "on-plan": "var(--trading-up)",
  drift: "var(--primary)",
  off: "var(--trading-down)",
};

export function varianceColor(pct: number): string {
  return BAND_COLOR[varianceBand(pct)];
}

/**
 * SYMMETRIC LOG (260731 user decision): a +408% category next to a −8% one left a
 * huge empty gap on a linear axis. symlog keeps zero meaningful and negatives
 * intact — it is near-linear inside the on-plan band (so ±5% vs ±10% stays
 * readable) and compresses beyond it, so one runaway category no longer squashes
 * every other bar into the centre. k = the band half-width, which is what makes it
 * adapt around the scale that matters here.
 */
const SYMLOG_K = ON_PLAN_BAND_PCT;

export function symlog(pct: number): number {
  const sign = pct < 0 ? -1 : 1;
  return sign * Math.log10(1 + Math.abs(pct) / SYMLOG_K);
}

export function symexp(t: number): number {
  const sign = t < 0 ? -1 : 1;
  return sign * (Math.pow(10, Math.abs(t)) - 1) * SYMLOG_K;
}

/**
 * Axis range: lowest → highest variance, each rounded OUTWARD to 10 and padded so
 * the end labels have room. Asymmetric on purpose (260731 user decision) — a
 * +408% category must fit, and forcing the mirror image of it would squash every
 * other bar into the middle. Zero is always inside the range so the centre line
 * and the on-plan band always render.
 */
export function divergingDomain(values: number[]): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  const lo = Math.min(0, ...finite);
  const hi = Math.max(0, ...finite);
  let min = Math.floor(lo / 10) * 10;
  let max = Math.ceil(hi / 10) * 10;
  // A flat month would collapse to a zero-width axis — keep the band visible.
  const MIN_SPAN = ON_PLAN_BAND_PCT * 4;
  if (max - min < MIN_SPAN) {
    const grow = Math.ceil((MIN_SPAN - (max - min)) / 2 / 10) * 10;
    min -= grow;
    max += grow;
  }
  const pad = Math.max(10, Math.ceil(((max - min) * AXIS_PAD) / 10) * 10);
  return [min - pad, max + pad];
}

/**
 * Ticks from a fixed ladder, filtered to the visible range — on a log axis evenly
 * spaced numbers would bunch up, so the ladder gets coarser as it goes out. Zero is
 * always present (it is the reference the whole chart is built around).
 */
const TICK_LADDER = [10, 20, 50, 100, 200, 400, 800, 1600, 3200, 6400] as const;

export function divergingTicks(min: number, max: number): number[] {
  const ticks = new Set<number>([0]);
  for (const t of TICK_LADDER) {
    if (t <= max) ticks.add(t);
    if (-t >= min) ticks.add(-t);
  }
  return [...ticks].sort((a, b) => a - b);
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
  // The axis is drawn in SYMLOG space (see symlog above): bars, domain and ticks
  // are all transformed, and every user-facing number is inverted back with
  // symexp — so labels and the tooltip always speak real percent.
  const rows = data.map((r) => {
    const pct = Number(r[valueKey]);
    const safe = Number.isFinite(pct) ? pct : 0;
    return { ...r, __pct: symlog(safe), __raw: safe, __label: fmtPct(safe) };
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
            x1={symlog(-ON_PLAN_BAND_PCT)}
            x2={symlog(ON_PLAN_BAND_PCT)}
            fill="var(--trading-up)"
            fillOpacity={0.08}
            strokeOpacity={0}
          />
          <XAxis
            type="number"
            domain={[symlog(min), symlog(max)]}
            ticks={divergingTicks(min, max).map(symlog)}
            tickFormatter={(t: number) => fmtPct(symexp(t))}
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
                // The bar's dataKey is an internal ("__pct") — showing it as a
                // series row leaked that name into the tooltip. Only the caller's
                // own rows (planned / actual / difference) are meaningful here.
                hideSeriesRows
                labelFormat={labelFormat}
                extra={tooltipExtra}
              />
            }
          />
          <Bar
            dataKey="__pct"
            barSize={BAR_SIZE}
            isAnimationActive={false}
            // A category that landed exactly on plan draws nothing at all
            // otherwise — an empty row reads as missing data. 2px keeps a thin
            // mark on the centre line (its "0%" label sits beside it).
            minPointSize={2}
            // …and that mark STRADDLES the line rather than starting at it: a
            // bar growing right said "over" for a month that landed on plan.
            shape={(props: {
              x?: number;
              width?: number;
              payload?: { __pct?: number };
            }) => {
              const onPlan = Number(props.payload?.__pct ?? 0) === 0;
              return (
                <Rectangle
                  {...props}
                  x={onPlan ? (props.x ?? 0) - (props.width ?? 0) / 2 : props.x}
                  radius={onPlan ? 1 : 4}
                />
              );
            }}
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
    </div>
  );
}
