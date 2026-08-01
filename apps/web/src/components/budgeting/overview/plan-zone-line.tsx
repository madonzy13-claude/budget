"use client";
/**
 * plan-zone-line.tsx — the ACTUAL line, stroked per plan zone with the limit line
 * itself as the boundary (260801).
 *
 * Zones follow WHERE THE MONTH'S MONEY CAME FROM (260801): the stretch the limit
 * covered is green, the stretch the reserve covered is yellow, the rest is red —
 * so a month that spent 175 against a 100 limit with a 50 reserve reads roughly
 * 57% / 28% / 15% (see zoneThresholds for the visibility floors).
 *
 * The line is CUT at its crossings and each piece stroked in one colour. Clipping
 * three copies to three regions instead painted two colours wherever the line ran
 * within a stroke-width of a boundary — a month whose spend ended level with its
 * reserve came out green and red at once (user report).
 *
 * Rendered through recharts' <Customized>. Recharts 3 dropped the xAxisMap /
 * yAxisMap props it used to hand such components, so the scales and plot rect
 * come from its hooks instead — same numbers the chart itself draws with.
 */
import { usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { zoneSegments } from "@/lib/actual-over-plan";
import { polylinePath, type Pt } from "@/lib/plan-zone-paths";

export interface PlanZoneRow {
  label: string;
  /** The month's spend split by origin: limit, reserve drawn, overspend. */
  withinLimit?: number;
  reserveUsed?: number;
  overspent?: number;
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
  /**
   * The month-boundary DROP carries no verdict — it is the reset itself, so it
   * is drawn in this neutral grey rather than the month's colour (260801).
   */
  resetColor?: string;
  strokeWidth?: number;
}

export function PlanZoneLine({
  rows,
  colors,
  resetColor = "var(--muted-foreground)",
  strokeWidth = 2,
}: PlanZoneLineProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || rows.length === 0) return null;

  // Pixel x of each data point, from the chart's own (time) scale; a fractional
  // index (a crossing inside a segment) interpolates between its neighbours.
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

  // The month reset: the vertical fall back to zero, drawn thin and in grey
  // UNDER the line, since it is the reset and not spending.
  const drops = rows.slice(1).map((r) => !!r.drop);
  const dropPts = rows.map((r, i) => ({
    x: pointXs[i]!,
    y: yScale(r.real) as number,
  }));

  const segments = zoneSegments(rows)
    .map((seg) => ({ zone: seg.zone, pts: toPx(seg.points) }))
    // A piece with no width carries no reading, and drawing it would paint a
    // vertical over the grey reset at the same x (a month one day old).
    .filter((seg) => seg.pts[0]!.x !== seg.pts[seg.pts.length - 1]!.x);

  return (
    <g data-testid="plan-zone-line" data-mode="zones" pointerEvents="none">
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
      {segments.map((seg, i) => (
        <path
          key={i}
          d={polylinePath(seg.pts)}
          fill="none"
          stroke={colors[seg.zone]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}
