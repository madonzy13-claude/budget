"use client";
/**
 * plan-zone-line.tsx — the ACTUAL line, stroked per plan zone with the limit line
 * itself as the boundary (260801).
 *
 * Zones: inside the plan (green), covered by that month's reserve (yellow), past
 * both (red) — the boundaries are the plan band's top and the reserve band's top,
 * the same geometry the chart paints.
 *
 * A stroke gradient can only split a line along a straight boundary — vertical, in
 * x — so wherever a limit line is sloped the colour changed at the wrong angle
 * (user report). Here the line is drawn once per colour and each copy is clipped
 * to its zone REGION, built from the very same needs / needs+wants geometry the
 * chart paints. The boundary is then the limit line, at whatever slope it has.
 *
 * Rendered through recharts' <Customized>. Recharts 3 dropped the xAxisMap /
 * yAxisMap props it used to hand such components, so the scales and plot rect
 * come from its hooks instead — same numbers the chart itself draws with.
 */
import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { sampleSeries } from "@/lib/actual-over-plan";
import {
  polylinePath,
  polylineRuns,
  regionAbove,
  regionBelow,
  regionBetween,
  type Pt,
} from "@/lib/plan-zone-paths";

export interface PlanZoneRow {
  label: string;
  /** Reserve available that month — the plan-to-red gap (260801). */
  reserve?: number;
  /** Epoch ms — the chart's x-axis is numeric so spacing follows real time. */
  ts: number;
  real: number;
  needs: number;
  wants: number;
  [key: string]: unknown;
}

export interface PlanZoneLineProps {
  rows: PlanZoneRow[];
  colors: { under: string; between: string; over: string };
  /** Straight segments (monthly buckets) vs the monotone curve (daily). */
  linear?: boolean;
  /**
   * The month-boundary DROP carries no verdict — it is the reset itself, so it
   * is drawn in this neutral grey rather than the month's colour (260801).
   */
  resetColor?: string;
  /** Unique per chart instance — clipPath ids are document-global. */
  idPrefix: string;
  strokeWidth?: number;
}

export function PlanZoneLine({
  rows,
  colors,
  linear = false,
  resetColor = "var(--muted-foreground)",
  idPrefix,
  strokeWidth = 2,
}: PlanZoneLineProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || rows.length === 0) return null;

  // Pixel x of each data point, from the chart's own (time) scale; sub-positions
  // interpolate between neighbours, so uneven spacing is handled for free.
  const pointXs = rows.map((r) => xScale(r.ts) as number);
  if (pointXs.some((x) => !Number.isFinite(x))) return null;
  const toPx = (samples: Array<{ x: number; v: number }>): Pt[] =>
    samples.map(({ x, v }) => {
      const i = Math.min(rows.length - 2, Math.max(0, Math.floor(x)));
      const t = rows.length < 2 ? 0 : x - i;
      const x0 = pointXs[i]!;
      const x1 = pointXs[Math.min(rows.length - 1, i + 1)]!;
      return { x: x0 + (x1 - x0) * t, y: yScale(v) as number };
    });

  const opts = { linear };
  const actualSamples = sampleSeries(
    rows.map((r) => r.real),
    opts,
  );
  const actual = toPx(actualSamples);
  // Green below the PLAN, yellow through the reserve above it, red past both.
  const plan = toPx(
    sampleSeries(
      rows.map((r) => r.needs + r.wants),
      opts,
    ),
  );
  const covered = toPx(
    sampleSeries(
      rows.map((r) => r.needs + r.wants + (r.reserve ?? 0)),
      opts,
    ),
  );

  // The reset line is only the VERTICAL fall back to zero — the flat hold into
  // the boundary before it is still that month's spending.
  const drops = rows.slice(1).map((r) => !!r.drop);
  // A segment with no width carries no reading, and drawing it would paint a
  // full-height vertical over the grey reset at the same x (user screenshot:
  // a month one day old). Skip those along with the drops.
  const skipSegment = drops.map(
    (isDrop, i) => isDrop || pointXs[i] === pointXs[i + 1],
  );

  const top = plot.y;
  const bottom = plot.y + plot.height;
  // Each sample carries its fractional index into `rows`, so the data segment it
  // sits in is floor(x) — the zone-coloured copies skip the drops entirely.
  const sampleSkip = actualSamples.map(
    (s) => !!skipSegment[Math.min(skipSegment.length - 1, Math.floor(s.x))],
  );
  const line = polylineRuns(actual, sampleSkip);
  const dropPts = rows.map((r, i) => ({
    x: pointXs[i]!,
    y: yScale(r.real) as number,
  }));
  const zones = [
    {
      id: `${idPrefix}-under`,
      d: regionBelow(plan, bottom),
      color: colors.under,
    },
    {
      id: `${idPrefix}-between`,
      d: regionBetween(covered, plan),
      color: colors.between,
    },
    {
      id: `${idPrefix}-over`,
      d: regionAbove(covered, top),
      color: colors.over,
    },
  ];

  return (
    <g data-testid="plan-zone-line" data-mode="zones" pointerEvents="none">
      <defs>
        {zones.map((z) => (
          <clipPath key={z.id} id={z.id}>
            <path d={z.d} />
          </clipPath>
        ))}
      </defs>
      {drops.map((isDrop, i) =>
        isDrop ? (
          <path
            key={`reset-${i}`}
            d={polylinePath([dropPts[i]!, dropPts[i + 1]!])}
            fill="none"
            stroke={resetColor}
            strokeWidth={Math.max(1, strokeWidth - 1)}
          />
        ) : null,
      )}
      {zones.map((z) => (
        <path
          key={z.id}
          d={line}
          fill="none"
          stroke={z.color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          clipPath={`url(#${z.id})`}
        />
      ))}
    </g>
  );
}
