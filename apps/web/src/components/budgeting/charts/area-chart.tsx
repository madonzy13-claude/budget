"use client";

/**
 * area-chart.tsx — themed, responsive Area wrapper (11-02).
 * Client component (ResponsiveContainer → ResizeObserver). Data-agnostic: takes
 * already-shaped data + series descriptors; 11-09 wires the data.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { clampAnchorX, TOOLTIP_MAX_PX } from "@/lib/chart-tooltip-anchor";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import {
  CHART_THEME,
  chartAxis,
  chartTooltip,
  leftAlignedYTick,
  type ChartSeries,
} from "./chart-theme";
import { ChartTooltipContent } from "./chart-tooltip";
import {
  useCloseOnScroll,
  useDismissTooltip,
  useTooltipExclusivity,
} from "./use-dismiss-tooltip";
import { nearestIndex, seriesTops } from "@/lib/chart-scrub";
import { monthFirstTicks, thinTimeTicks } from "@/lib/chart-ticks";
import { useSlotReveal } from "@/components/budgeting/overview/slot-amount";
import { cn } from "@/lib/utils";

/** recharts' own active-dot look, so a per-point renderer matches the default. */
function DefaultActiveDot(props: {
  cx?: number;
  cy?: number;
  fill?: string;
  stroke?: string;
}) {
  if (props.cx == null || props.cy == null) return <g />;
  return (
    <circle
      cx={props.cx}
      cy={props.cy}
      r={4}
      fill={props.fill ?? props.stroke ?? CHART_THEME.accent}
      stroke="#fff"
      strokeWidth={2}
    />
  );
}

/** A fixed 3-dot mask — hides the amount entirely (magnitude, K/M suffix, and
 *  all) with a constant width regardless of the real number. */
const AMOUNT_MASK = "•••";

export function OverviewAreaChart({
  data,
  xKey,
  series,
  height = 240,
  tooltipBelow = true,
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
  xTickPerMonth = false,
  scrub = false,
}: {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  /** Anchor the tooltip just UNDER the point it describes (10px below the
   *  dot) instead of letting recharts place the box wherever it fits — which
   *  on a phone meant over the chart, or reaching up over the sticky range
   *  band above it (user, 261016). On by default; pass false for a chart that
   *  wants recharts' own placement. */
  tooltipBelow?: boolean;
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
    /** The row a change is measured FROM: the first point, or the start of a
     *  selected range (`scrub`). */
    base?: Record<string, unknown>,
  ) => string | string[] | undefined;
  /** Grid-aligned summary row (e.g. Total) below a hairline. */
  summary?: (
    row: Record<string, unknown>,
    base?: Record<string, unknown>,
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
  /** One tick per calendar month — for an axis that names months, not days. */
  xTickPerMonth?: boolean;
  /**
   * 261102 (user): the chart owns the pointer. The cursor stays while a finger
   * or the mouse slides — over the tooltip or past the plot's edge — the
   * tooltip rides just under the line it describes, and a drag (mouse) or two
   * fingers (touch) select a range whose change the tooltip then shows,
   * measured from the range's start (`base` in rowSuffix / summary).
   */
  scrub?: boolean;
}) {
  // Measured so the anchor can be pulled back from the right edge: anchoring
  // puts the box's LEFT edge at the point, and a point near the end of the
  // series pushed it off screen (user, 261016).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [plotW, setPlotW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setPlotW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tipW = Math.min(
    TOOLTIP_MAX_PX,
    typeof window === "undefined" ? TOOLTIP_MAX_PX : window.innerWidth - 32,
  );

  const { chartProps, tooltipProps, contentExtra, hideCursor, anchor } =
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
  const scrubber = useScrub({ data, xKey, wrapRef });
  const chart = (
    <div ref={wrapRef} className={cn("w-full", scrub && "relative")}>
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
                    (() => {
                      const vals = data
                        .filter((d) => !d.reset)
                        .map((d) => Number(d[xKey]));
                      return xTickPerMonth ? monthFirstTicks(vals) : vals;
                    })(),
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
          {!scrub && (
            <Tooltip
              {...tooltipProps}
              // Just under the point it describes — not parked at the bottom of
              // the plot, which was too far away (user, 261016). Both coordinates
              // are passed because recharts only honours `position` when it
              // carries x AND y; a y-only override is silently ignored.
              {...(tooltipBelow && anchor
                ? {
                    position: {
                      x: clampAnchorX(anchor.x, plotW, tipW),
                      y: anchor.y,
                    },
                  }
                : {})}
              cursor={hideCursor ? false : chartTooltip.cursor}
              content={
                <ChartTooltipContent
                  formatY={tooltipFmt}
                  series={series}
                  omitKeys={tooltipOmitKeys}
                  colorForRow={tooltipColorForRow}
                  labelFormat={labelFormat ?? xTickFormat}
                  extra={tooltipExtra}
                  rowSuffix={
                    rowSuffix && ((row, key) => rowSuffix(row, key, data[0]))
                  }
                  summary={summary && ((row) => summary(row, data[0]))}
                  {...contentExtra}
                />
              }
            />
          )}
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
                zIndex={s.zIndex}
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
                // A dot only where the tooltip has something to say — a point you
                // can hit but not read is a dead target (260801 user report).
                activeDot={
                  hideCursor || s.noActiveDot
                    ? false
                    : (props: {
                        cx?: number;
                        cy?: number;
                        fill?: string;
                        stroke?: string;
                        payload?: Record<string, unknown>;
                      }) =>
                        // Matches the tooltip: a dot only where there is something
                        // to read. A dot with no tooltip behind it is a dead target.
                        props.payload?.[s.key] == null ? (
                          <g />
                        ) : (
                          <DefaultActiveDot {...props} />
                        )
                }
                isAnimationActive={false}
              />
            );
          })}
          {overlay}
          {scrub && (
            <ScrubMarks
              data={data}
              xKey={xKey}
              series={series}
              active={scrubber.active}
              range={scrubber.range}
              geo={scrubber.geo}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      {scrub && (
        <ScrubTooltip
          scrubber={scrubber}
          data={data}
          xKey={xKey}
          series={series}
          plotW={plotW}
          tipW={tipW}
          height={height}
          formatY={tooltipFmt}
          labelFormat={labelFormat ?? xTickFormat}
          rowSuffix={rowSuffix}
          summary={summary}
        />
      )}
    </div>
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

type Row = Record<string, unknown>;
/** Space between the scrub tooltip and the plot it sits outside of. */
const TIP_GAP = 8;

/**
 * Whether `need` px above the chart are on screen and not under anything
 * outside the chart's own section — a sticky bar (the range pills) would
 * otherwise cover the tooltip's top.
 */
function roomAbove(layer: HTMLElement | null, x: number, need: number) {
  if (!layer) return true;
  const r = layer.getBoundingClientRect();
  const y = r.top - need;
  if (y < 0) return false;
  const hit = document.elementFromPoint(r.left + x, y);
  const own = layer.closest("section") ?? layer.parentElement;
  return !hit || !!own?.contains(hit);
}
interface ScrubGeo {
  /** Pixel x of every data point, left to right. */
  xs: number[];
  /** Value → pixel y on the chart's Y axis. */
  y: (v: number) => number | undefined;
}

/**
 * The chart's own pointer handling (`scrub`). A transparent layer over the
 * whole chart takes every pointer, so nothing — the tooltip included — can
 * steal a slide from under it; mouse capture and touch's implicit capture keep
 * it tracking past the plot's edge (261102, user: the line vanished when the
 * pointer slid over the tooltip or out of the chart).
 */
function useScrub({
  data,
  xKey,
  wrapRef,
}: {
  data: Row[];
  xKey: string;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const geo = useRef<ScrubGeo | null>(null);
  const pointers = useRef(new Map<number, number>());
  const press = useRef<{
    start: number;
    downX: number;
    moved: boolean;
    wasOpen: boolean;
  } | null>(null);
  // This gesture had two fingers down: its range outlives the fingers, and a
  // finger left behind no longer moves anything (261103, user).
  const pinned = useRef(false);
  const close = () => {
    pinned.current = false;
    setActive(null);
    setRange(null);
  };
  const announce = useTooltipExclusivity(close);
  useCloseOnScroll(() => {
    if (pointers.current.size === 0) setActive(null);
  });
  // A new series (range pill, view toggle) starts with nothing selected —
  // keyed by its extent, as a refetch hands over a new but equal array.
  const extent = `${data.length}|${String(data[0]?.[xKey])}|${String(data.at(-1)?.[xKey])}`;
  useEffect(close, [extent]);

  const relX = (e: React.PointerEvent) =>
    e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0);
  const indexAt = (x: number) => nearestIndex(geo.current?.xs ?? [], x);
  const show = (i: number) => {
    if (i < 0) return;
    if (active == null) announce();
    setActive(i);
  };
  const spread = (): [number, number] => {
    const [a, b] = [...pointers.current.values()].slice(0, 2).map(indexAt);
    return a! <= b! ? [a!, b!] : [b!, a!];
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const x = relX(e);
      const first = pointers.current.size === 0;
      pointers.current.set(e.pointerId, x);
      if (e.pointerType === "mouse")
        e.currentTarget.setPointerCapture(e.pointerId);
      if (pointers.current.size >= 2) {
        press.current = null;
        pinned.current = true;
        setRange(spread());
        return;
      }
      // A tap on the chart puts away a range left up by two fingers.
      if (first && pinned.current) {
        close();
        return;
      }
      const i = indexAt(x);
      press.current = {
        start: i,
        downX: x,
        moved: false,
        wasOpen: active === i,
      };
      show(i);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const x = relX(e);
      const pressed = pointers.current.has(e.pointerId);
      if (pressed) pointers.current.set(e.pointerId, x);
      if (pointers.current.size >= 2) {
        setRange(spread());
        return;
      }
      if (pinned.current || (pressed && !press.current)) return;
      const i = indexAt(x);
      const p = press.current;
      if (p && pressed) {
        if (Math.abs(x - p.downX) > 6) p.moved = true;
        // A mouse drag selects; one finger only slides the cursor.
        if (e.pointerType === "mouse" && p.moved && i !== p.start)
          setRange(p.start < i ? [p.start, i] : [i, p.start]);
      }
      show(i);
    },
    onPointerUp: (e: React.PointerEvent) => {
      pointers.current.delete(e.pointerId);
      const p = press.current;
      if (pointers.current.size < 2 && !pinned.current) setRange(null);
      if (pointers.current.size > 0) return;
      press.current = null;
      // A tap on the point already open closes it — the old tap-to-dismiss.
      if (e.pointerType !== "mouse" && p && !p.moved && p.wasOpen)
        setActive(null);
    },
    onPointerCancel: (e: React.PointerEvent) => {
      // The page took the gesture (a vertical scroll): let go of everything —
      // but a two-finger range stays, as it would on lifting the fingers.
      pointers.current.delete(e.pointerId);
      press.current = null;
      if (!pinned.current) close();
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && pointers.current.size === 0)
        setActive(null);
    },
  };
  /** A tap on the tooltip puts it away — not a stray touch mid-gesture. */
  const tapTooltip = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (pointers.current.size > 0) return;
    close();
  };
  return { active, range, geo, handlers, pointers, tapTooltip };
}

/** Cursor line, dots and the range shade — drawn in chart space. Also hands
 *  the axis scales to the pointer layer. */
function ScrubMarks({
  data,
  xKey,
  series,
  active,
  range,
  geo,
}: {
  data: Row[];
  xKey: string;
  series: ChartSeries[];
  active: number | null;
  range: [number, number] | null;
  geo: React.RefObject<ScrubGeo | null>;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (xScale && yScale)
    geo.current = {
      xs: data.map((r) => xScale(r[xKey]) ?? Number.NaN),
      y: (v) => yScale(v),
    };
  const marks = (i: number, key: string) => {
    const row = data[i];
    if (!row) return null;
    const tops = seriesTops(row, series);
    return (
      <g key={key}>
        <ReferenceLine
          x={row[xKey] as string | number}
          stroke={chartTooltip.cursor.stroke}
          strokeWidth={chartTooltip.cursor.strokeWidth}
        />
        {series.map((s) =>
          tops[s.key] == null || s.noActiveDot ? null : (
            <ReferenceDot
              key={s.key}
              x={row[xKey] as string | number}
              y={tops[s.key]}
              shape={(p: { cx?: number; cy?: number }) => (
                <g data-scrub-dot>
                  <DefaultActiveDot
                    cx={p.cx}
                    cy={p.cy}
                    fill={s.color ?? CHART_THEME.accent}
                  />
                </g>
              )}
            />
          ),
        )}
      </g>
    );
  };
  if (range) {
    const [a, b] = range;
    return (
      <g data-testid="chart-range">
        <ReferenceArea
          x1={data[a]?.[xKey] as string | number}
          x2={data[b]?.[xKey] as string | number}
          fill={CHART_THEME.accent}
          fillOpacity={0.12}
        />
        {marks(a, "a")}
        {marks(b, "b")}
      </g>
    );
  }
  return active == null ? null : marks(active, "active");
}

/** The pointer layer plus the tooltip: under the hovered point, or — for a
 *  range — the change from its start to its end. */
function ScrubTooltip({
  scrubber,
  data,
  xKey,
  series,
  plotW,
  tipW,
  height,
  formatY,
  labelFormat,
  rowSuffix,
  summary,
}: {
  scrubber: ReturnType<typeof useScrub>;
  data: Row[];
  xKey: string;
  series: ChartSeries[];
  plotW: number;
  tipW: number;
  height: number;
  formatY?: (n: number) => string;
  labelFormat?: (label: string | number) => string;
  rowSuffix?: (
    row: Row,
    dataKey?: string | number,
    base?: Row,
  ) => string | string[] | undefined;
  summary?: (
    row: Row,
    base?: Row,
  ) => { label: string; value: string; suffix?: string[] } | null;
}) {
  const { active, range, geo, handlers, pointers, tapTooltip } = scrubber;
  const tipRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const w = tipRef.current?.offsetWidth ?? 0;
    const h = tipRef.current?.offsetHeight ?? 0;
    if (w !== tip.w || h !== tip.h) setTip({ w, h });
  });
  // Two fingers on the chart are a range, never a scroll: the browser would
  // take a two-finger drift as a pan and cancel the gesture (261103, user: the
  // range vanished mid-drag). Native + non-passive, as React's touch
  // listeners are passive and cannot preventDefault.
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (e.touches.length >= 2 || pointers.current.size >= 2)
        e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => el.removeEventListener("touchmove", hold);
  }, [pointers]);

  const [from, to] = range ?? [0, active ?? -1];
  const row = data[to];
  let box: { left: number; top: number } | null = null;
  if (row && geo.current) {
    // OUTSIDE the plot (261103, user: over it, the tooltip hid the very line
    // it described) — above it, over the figures the chart sits under, centred
    // on the point or the range. Below it only when the page's top would cut
    // it off; a finger comes from below, so below is the second choice.
    const x = range
      ? ((geo.current.xs[from] ?? 0) + (geo.current.xs[to] ?? 0)) / 2
      : (geo.current.xs[to] ?? 0);
    const w = Math.min(tip.w || tipW, plotW);
    const left = Math.min(Math.max(0, x - w / 2), Math.max(0, plotW - w));
    box = {
      left,
      top: roomAbove(layerRef.current, left + w / 2, tip.h + TIP_GAP)
        ? -tip.h - TIP_GAP
        : height + TIP_GAP,
    };
  }
  const base = data[from];
  const fmtLabel = (l: string | number) =>
    labelFormat ? labelFormat(l) : String(l);
  return (
    <>
      <div
        ref={layerRef}
        data-testid="chart-scrub-layer"
        className="absolute inset-0 z-10 touch-pan-y select-none"
        {...handlers}
      />
      {box && row && (
        <div
          ref={tipRef}
          data-testid={range ? "chart-range-tooltip" : "chart-scrub-tooltip"}
          className="absolute z-20"
          style={{ left: box.left, top: box.top }}
          onPointerDown={tapTooltip}
        >
          <ChartTooltipContent
            active
            payload={series.map((s) => ({
              dataKey: s.key,
              name: s.label,
              value: row[s.key] as number | undefined,
              color: s.color,
              payload: row,
            }))}
            label={String(row[xKey])}
            labelFormat={() => {
              const end = fmtLabel(row[xKey] as string | number);
              return range && base
                ? `${fmtLabel(base[xKey] as string | number)} – ${end}`
                : end;
            }}
            formatY={formatY}
            series={series}
            rowSuffix={rowSuffix && ((r, key) => rowSuffix(r, key, base))}
            summary={summary && ((r) => summary(r, base))}
          />
        </div>
      )}
    </>
  );
}
