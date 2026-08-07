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
import { CHART_THEME } from "@/components/budgeting/charts/chart-theme";

/**
 * The month reset is STRUCTURE, not a reading, so it stays quieter than the hover
 * cursor — the line the user actually asked for. A washed-out grey rather than the
 * hairline: the hairline is near-white under the LIGHT theme, where the reset read
 * as a white gap, and it was too faint to follow on dark (user report, 260802).
 * Same grey as the cursor, held back to just over half strength.
 */
export const RESET_STROKE = `color-mix(in srgb, ${CHART_THEME.axis} 55%, transparent)`;

export interface PlanZoneRow {
  label: string;
  /** The month's spend split by origin: limit, reserve drawn, overspend. */
  withinLimit?: number;
  reserveUsed?: number;
  overspent?: number;
  /** Epoch ms — the chart's x-axis is numeric so spacing follows real time. */
  ts: number;
  /** The vertical fall back to zero at a month boundary. */
  drop?: boolean;
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
   * is drawn in this neutral hairline rather than the month's colour (260801).
   */
  resetColor?: string;
  strokeWidth?: number;
}

export function PlanZoneLine({
  rows,
  colors,
  resetColor = RESET_STROKE,
  strokeWidth = 2,
}: PlanZoneLineProps) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot || rows.length === 0) return null;

  // Pixel x of each data point, from the chart's own (time) scale; a fractional
  // index (a crossing inside a segment) interpolates between its neighbours.
  // A month's last reading already sits ON the boundary (insertMonthResets moves
  // it there), so the line rises straight into the fall with no stub and no gap.
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
  //
  // It falls AT THE BOUNDARY, straight down from the total the month closed on:
  // the month's last reading was moved to a millisecond before it, so the fall is
  // 90° and starts exactly where the line arrives — no stub, no gap, no rail
  // along the baseline (user reports, 260802).
  const resets: Pt[][] = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i]!.drop) continue;
    resets.push([
      { x: pointXs[i - 1]!, y: yScale(rows[i - 1]!.real) as number },
      { x: pointXs[i]!, y: yScale(rows[i]!.real) as number },
    ]);
  }

  const segments = zoneSegments(rows)
    .map((seg) => ({ zone: seg.zone, pts: toPx(seg.points) }))
    // A piece with no width carries no reading, and drawing it would paint a
    // vertical over the grey reset at the same x (a month one day old).
    .filter((seg) => seg.pts[0]!.x !== seg.pts[seg.pts.length - 1]!.x);

  return (
    <g data-testid="plan-zone-line" data-mode="zones" pointerEvents="none">
      {resets.map((pts, i) => (
        <path
          key={`reset-${i}`}
          d={polylinePath(pts)}
          fill="none"
          stroke={resetColor}
          strokeWidth={Math.max(1, strokeWidth - 1)}
        />
      ))}
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
