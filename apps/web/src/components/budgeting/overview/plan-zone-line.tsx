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
import { monthSegmentZones, sampleSeries } from "@/lib/actual-over-plan";
import {
  polylinePath,
  regionAbove,
  regionBelow,
  regionBetween,
  type Pt,
} from "@/lib/plan-zone-paths";

export interface PlanZoneRow {
  label: string;
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
   * MONTHLY buckets colour by month, not by geometry: each segment carries the
   * verdict of the month it leads into and the colour steps at the point. A month
   * that stayed inside its limit then shows no red at all, whatever the climb into
   * it looked like. Daily buckets stay geometric — there the line is continuous,
   * so "above the limit right here" is the honest reading.
   */
  perMonth?: boolean;
  /** Unique per chart instance — clipPath ids are document-global. */
  idPrefix: string;
  strokeWidth?: number;
}

export function PlanZoneLine({
  rows,
  colors,
  linear = false,
  perMonth = false,
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

  if (perMonth) {
    const zonesPerSegment = monthSegmentZones(rows);
    const pointPts = rows.map((r, i) => ({
      x: pointXs[i]!,
      y: yScale(r.real) as number,
    }));
    return (
      <g data-testid="plan-zone-line" data-mode="months" pointerEvents="none">
        {zonesPerSegment.map((zone, i) => (
          <path
            key={i}
            d={polylinePath([pointPts[i]!, pointPts[i + 1]!])}
            fill="none"
            stroke={colors[zone]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  }

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
    <g data-testid="plan-zone-line" data-mode="zones" pointerEvents="none">
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
