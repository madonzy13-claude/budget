"use client";
/**
 * plan-zone-line.tsx — the ACTUAL line, stroked per plan zone with the limit line
 * itself as the boundary (260801).
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
  regionAbove,
  regionBelow,
  regionBetween,
  type Pt,
} from "@/lib/plan-zone-paths";

export interface PlanZoneRow {
  label: string;
  real: number;
  needs: number;
  wants: number;
}

export interface PlanZoneLineProps {
  rows: PlanZoneRow[];
  colors: { under: string; between: string; over: string };
  /** Straight segments (monthly buckets) vs the monotone curve (daily). */
  linear?: boolean;
  /** Unique per chart instance — clipPath ids are document-global. */
  idPrefix: string;
  strokeWidth?: number;
}

export function PlanZoneLine({
  rows,
  colors,
  linear = false,
  idPrefix,
  strokeWidth = 2,
}: PlanZoneLineProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || rows.length === 0) return null;

  // Pixel x of each data point; sub-positions interpolate between them (a
  // category axis spaces points evenly, which is what sampleSeries assumes).
  const pointXs = rows.map((r) => xScale(r.label) as number);
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
  const actual = toPx(
    sampleSeries(
      rows.map((r) => r.real),
      opts,
    ),
  );
  const needs = toPx(
    sampleSeries(
      rows.map((r) => r.needs),
      opts,
    ),
  );
  const total = toPx(
    sampleSeries(
      rows.map((r) => r.needs + r.wants),
      opts,
    ),
  );

  const top = plot.y;
  const bottom = plot.y + plot.height;
  const line = polylinePath(actual);
  const zones = [
    {
      id: `${idPrefix}-under`,
      d: regionBelow(needs, bottom),
      color: colors.under,
    },
    {
      id: `${idPrefix}-between`,
      d: regionBetween(total, needs),
      color: colors.between,
    },
    { id: `${idPrefix}-over`, d: regionAbove(total, top), color: colors.over },
  ];

  return (
    <g data-testid="plan-zone-line" pointerEvents="none">
      <defs>
        {zones.map((z) => (
          <clipPath key={z.id} id={z.id}>
            <path d={z.d} />
          </clipPath>
        ))}
      </defs>
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
