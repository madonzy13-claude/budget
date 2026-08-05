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
  usePlotArea,
  useXAxisScale,
  ReferenceArea,
  Customized,
  LabelList,
  Tooltip,
} from "recharts";
import { CHART_THEME, chartAxis } from "./chart-theme";
import { CategoryTick } from "./category-tick";
import { ChartTooltipContent } from "./chart-tooltip";
import { useSlotReveal } from "@/components/budgeting/overview/slot-amount";

/** Half-width of the "close enough to plan" band, in percent. */
export const ON_PLAN_BAND_PCT = 10;
/** One per row, in row order — recharts wraps each bar's path in this. */
const BAR_SELECTOR = ".recharts-bar-rectangle";
/** The percent (or amount) printed at the bar's end — a tap target of its own. */
const LABEL_SELECTOR = "[data-variance-label]";
const BAR_SIZE = 14;
const ROW_PX = 34;
/** Axis padding (share of the span) so the outermost percent label has room. */
const AXIS_PAD = 0.12;

export type VarianceBand = "on-plan" | "under" | "over";

/**
 * Colour band by DIRECTION past ±10% (260805 user decision, replacing the
 * magnitude rule of 260731). Overspending and underspending are not the same
 * mistake: one costs money the budget does not have, the other only means the
 * plan was loose. So over goes red and under goes yellow, and there is no
 * second tier either way — 60% over is not a different KIND of problem from 20%
 * over, and the bar's own length already says which is worse.
 */
export function varianceBand(pct: number): VarianceBand {
  if (Math.abs(pct) <= ON_PLAN_BAND_PCT) return "on-plan";
  return pct > 0 ? "over" : "under";
}

const BAND_COLOR: Record<VarianceBand, string> = {
  "on-plan": "var(--trading-up)",
  under: "var(--primary)",
  over: "var(--trading-down)",
};

export function varianceColor(pct: number): string {
  return BAND_COLOR[varianceBand(pct)];
}

/**
 * The band, unless the range is the month still running and the category is
 * UNDER plan — that is just "not spent yet", not an achievement, so it reads
 * grey rather than claiming success (260803 user request). Being OVER this
 * early is real, and keeps its band.
 */
/** Past this far under plan, the plan itself is the problem. */
export const PLAN_TOO_LOOSE_PCT = 30;

/**
 * The colour of the range's gap between planned and spent (260805).
 *
 * A different question from the by-category bars, so a different rule. Those ask
 * how well each category was PLANNED, and are green only inside a ±10% corridor.
 * This one figure asks whether the household stayed inside its budget: under is
 * simply money kept, green however far under — until 30% under, where the plan
 * is so far from what actually happens that it has stopped being a plan, and it
 * turns yellow. Over is red at any size; there is no amount of overspending that
 * is fine.
 */
export function plannedGapColor(pct: number): string {
  if (pct > 0) return "var(--trading-down)";
  return pct < -PLAN_TOO_LOOSE_PCT ? "var(--primary)" : "var(--trading-up)";
}

/**
 * The reserve chart's bands (260805). No drift band — a buffer is either about
 * the right size or it is not — and the two directions do NOT mean the same
 * thing: holding too little can fail a payment, holding too much is only idle
 * money. The meter above the chart already calls that amber ("Can withdraw"),
 * so a chart that called it red disagreed with the shape directly above it and
 * turned a page of ordinary surpluses into a wall of alarm (user, 260805).
 */
/**
 * What a FINGER selects (260805). A cursor may hover anywhere along a row — the
 * whole width is a fine target with a mouse — but on touch that meant tapping
 * the empty half of a row picked a bar you were nowhere near, and tapping the
 * tooltip picked whatever sat beneath it. A finger has to be on the bar itself.
 *
 * The row is read off the DOM rather than taken from the chart's own event: on
 * touch, recharts hands the handler the state from BEFORE the tap, so the
 * highlight always named the previously-tapped bar while the tooltip showed the
 * new one (user, 260805). What is under the finger cannot lag.
 */
export interface HitBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Pairs each bar with the figure printed at its end, so a row can be hit by
 * either. Pairing only when the counts line up: a mismatch would shift the
 * labels by a row and tag taps to the wrong category.
 */
export function rowHitBoxes(
  bars: readonly HitBox[],
  labels: readonly HitBox[],
): HitBox[][] {
  const paired = labels.length === bars.length;
  return bars.map((b, i) => (paired ? [b, labels[i]!] : [b]));
}

export function touchSelection(
  point: { x: number; y: number },
  rows: readonly (readonly HitBox[])[],
): number | null {
  const hit = (b: HitBox) =>
    point.x >= b.left &&
    point.x <= b.right &&
    point.y >= b.top &&
    point.y <= b.bottom;
  const i = rows.findIndex((targets) => targets.some(hit));
  return i >= 0 ? i : null;
}

/** The named field, when the row actually carries a readable number for it. */
function colorValue(raw: unknown): number | null {
  const n = Number(raw);
  return raw !== undefined && raw !== null && Number.isFinite(n) ? n : null;
}

export function reserveFitColor(pct: number): string {
  if (Math.abs(pct) <= ON_PLAN_BAND_PCT) return "var(--trading-up)";
  return pct > 0 ? "var(--primary)" : "var(--trading-down)";
}

export function varianceColorForRange(
  pct: number,
  opts: { runningMonthOnly: boolean },
): string {
  if (opts.runningMonthOnly && pct < 0) return "var(--muted-foreground)";
  return varianceColor(pct);
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

/**
 * Ticks for the MONEY reading of the same chart (260804). The percent ladder is
 * unit-specific, so money gets its own: 1/2.5/5 × 10^k steps sized to the data,
 * always through zero (the reference the whole chart is built around).
 */
export function amountTicks(min: number, max: number): number[] {
  const reach = Math.max(Math.abs(min), Math.abs(max));
  if (!Number.isFinite(reach) || reach === 0) return [0];
  const magnitude = 10 ** Math.floor(Math.log10(reach));
  // ~4 steps to the far end, snapped to a round mantissa.
  const raw = reach / 4;
  const mantissa = raw / 10 ** Math.floor(Math.log10(raw));
  const snapped =
    mantissa <= 1 ? 1 : mantissa <= 2 ? 2 : mantissa <= 2.5 ? 2.5 : 5;
  const step = snapped * 10 ** Math.floor(Math.log10(raw));
  const ticks = new Set<number>([0]);
  for (let t = step; t <= reach + step; t += step) {
    if (t <= max + step) ticks.add(t);
    if (-t >= min - step) ticks.add(-t);
    if (ticks.size > 24) break;
  }
  void magnitude;
  return [...ticks]
    .filter((t) => t >= min - step && t <= max + step)
    .sort((a, b) => a - b);
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
      data-variance-label
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

/** The centre line, as a plain child so its paint order is ours to choose. */
function ZeroLine() {
  const xScale = useXAxisScale();
  const plot = usePlotArea();
  if (!xScale || !plot) return null;
  const x = xScale(0) as number;
  if (!Number.isFinite(x)) return null;
  return (
    <line
      x1={x}
      x2={x}
      y1={plot.y}
      y2={plot.y + plot.height}
      stroke={CHART_THEME.axis}
      strokeOpacity={0.6}
    />
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
  colorForPct = varianceColor,
  colorKey = "pct",
  formatValue,
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
  /** Which field the COLOUR comes from, when it is not the plotted one. A bar
   *  drawn in zł is still banded by how far off plan it is — cents are not a
   *  percentage, and feeding them to a band function painted a +5% category red
   *  (user screenshots, 260805).
   *
   *  Defaults to "pct" rather than to the plotted value: this is a VARIANCE
   *  chart, its colour is always about variance, and as an opt-in prop one of
   *  the two call sites simply never got it. Rows without that field fall back
   *  to what is plotted. */
  colorKey?: string;
  /** Reads the axis and the bar labels in the caller's own unit — money instead
   *  of percent (260804). Given one, the ±10% "on plan" band is dropped too:
   *  a corridor measured in percent means nothing on a money axis, and its ticks
   *  come from the data's own magnitude. */
  formatValue?: (n: number) => string;
  /** Per-bar colour from its percent. Defaults to the plain band. */
  colorForPct?: (pct: number) => string;
}) {
  const { revealed } = useSlotReveal();
  const hideAmt = maskAmounts && !revealed;
  const tipFmt = hideAmt ? () => "•••" : (formatTooltip ?? fmtPct);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressStart = useRef<number | null>(null);
  // A touch is followed by a synthesised mouse sequence at the same point; this
  // is how long the mouse handlers stay out of the way afterwards.
  const touchedAt = useRef(0);
  const isGhostMouse = () => performance.now() - touchedAt.current < 700;
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

  /** Per row, everything a finger may land on: the bar, and the figure printed
   *  at its end. A stub bar is a few pixels wide, so its "+5%" is the only part
   *  of that row worth aiming at (user, 260805). Measured rather than hit-tested
   *  through the DOM: an SVG <text> only answers on its glyphs, so the gaps
   *  between the digits were dead. */
  const rowTargets = (): HitBox[][] => {
    const boxes = (sel: string) =>
      [...(wrapRef.current?.querySelectorAll(sel) ?? [])].map((el) =>
        el.getBoundingClientRect(),
      );
    return rowHitBoxes(boxes(BAR_SELECTOR), boxes(LABEL_SELECTOR));
  };

  const fromTouch = (
    // recharts hands the touch handlers either (state, event) or the event
    // alone depending on which one fired, and only the event is wanted here.
    first: unknown,
    second?: React.TouchEvent,
  ) => {
    touchedAt.current = performance.now();
    const e = (second ?? first) as React.TouchEvent | undefined;
    const t = e?.touches?.[0] ?? e?.changedTouches?.[0];
    if (!t) return setActive(null);
    setActive(touchSelection({ x: t.clientX, y: t.clientY }, rowTargets()));
  };

  const values = data.map((r) => Number(r[valueKey]));
  const money = typeof formatValue === "function";
  const fmtValue = formatValue ?? fmtPct;
  const [min, max] = money
    ? (() => {
        const finite = values.filter((v) => Number.isFinite(v));
        const lo = Math.min(0, ...finite);
        const hi = Math.max(0, ...finite);
        const pad = Math.max(1, (hi - lo) * AXIS_PAD);
        return [lo - pad, hi + pad] as [number, number];
      })()
    : divergingDomain(values);
  // The axis is drawn in SYMLOG space (see symlog above): bars, domain and ticks
  // are all transformed, and every user-facing number is inverted back with
  // symexp — so labels and the tooltip always speak real percent.
  const rows = data.map((r) => {
    const pct = Number(r[valueKey]);
    const safe = Number.isFinite(pct) ? pct : 0;
    return { ...r, __pct: symlog(safe), __raw: safe, __label: fmtValue(safe) };
  });

  const chartHeight = Math.max(height, rows.length * ROW_PX + 32);
  const dim = (ri: number) =>
    activeIndex === null || activeIndex === ri ? 1 : 0.3;

  return (
    <div
      ref={wrapRef}
      className="flex flex-col gap-1"
      data-scrub
      // pan-y, not none: a horizontal drag scrubs the bars, while the page still
      // scrolls THROUGH the chart. This one is a tall list — trapping vertical
      // scroll over it would strand the reader (260804).
      style={{ touchAction: "pan-y" }}
    >
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 8, right: 34, bottom: 0, left: 8 }}
          onMouseDown={() => {
            pressStart.current = activeRef.current;
          }}
          onMouseMove={(s: { activeTooltipIndex?: number | string | null }) => {
            // A touch synthesises a whole mouse sequence a moment later; it must
            // not re-select what the finger rules just declined.
            if (isGhostMouse()) return;
            setActive(coerceIdx(s?.activeTooltipIndex));
          }}
          onMouseLeave={() => setActive(null)}
          // A finger put down and slid scrubs directly: recharts only sees a
          // mouse move once a tap has synthesised one, so without this the bars
          // answered nothing until they were tapped first (user, 260804) — and
          // it must be ON a bar, not anywhere along the row (user, 260805).
          onTouchStart={fromTouch}
          onTouchMove={fromTouch}
          onClick={(s: { activeTooltipIndex?: number | string | null }) => {
            if (isGhostMouse()) return;
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
          {!money && (
            <ReferenceArea
              x1={symlog(-ON_PLAN_BAND_PCT)}
              x2={symlog(ON_PLAN_BAND_PCT)}
              fill="var(--trading-up)"
              fillOpacity={0.08}
              strokeOpacity={0}
            />
          )}
          <XAxis
            type="number"
            domain={[symlog(min), symlog(max)]}
            ticks={(money
              ? amountTicks(min, max)
              : divergingTicks(min, max)
            ).map(symlog)}
            tickFormatter={(t: number) => fmtValue(symexp(t))}
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
          {/* Drawn here, BEFORE the bars, so an on-plan category's mark reads on
              top of the line rather than under it. recharts 3 always paints a
              <ReferenceLine> after the bars, whatever the child order. */}
          <Customized component={<ZeroLine />} />
          <Tooltip
            active={activeIndex !== null}
            // Tappable, so a finger can put the tooltip away and clear the
            // selection — on touch there is no "move away" to dismiss with
            // (user, 260805).
            wrapperStyle={{ pointerEvents: "auto" }}
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
                onDismiss={() => setActive(null)}
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
                fill={colorForPct(
                  colorValue((row as Record<string, unknown>)[colorKey]) ??
                    row.__raw,
                )}
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
