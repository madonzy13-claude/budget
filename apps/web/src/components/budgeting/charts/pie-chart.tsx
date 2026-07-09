"use client";

/**
 * pie-chart.tsx — themed, responsive Pie wrapper (11-02).
 *
 * Static: no tap highlight, no tooltip. When `labeled`, every slice gets an
 * on-ring "<name> <pct>%" label with a leader line. Labels are DECONFLICTED —
 * within each side (left/right) they're pushed apart to a minimum vertical gap so
 * a few tiny adjacent slices (e.g. 0% / 1% / 5%) never overlap. No label is
 * skipped. Colors come from the caller via `colorFor`.
 */
import { useRef } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CHART_THEME } from "./chart-theme";

const RAD = Math.PI / 180;
// Pie geometry: start at the top, go clockwise — so our own label-angle math
// matches the slices recharts draws.
const START_ANGLE = 90;
const END_ANGLE = -270;
// Minimum vertical distance between two labels on the same side.
const LABEL_GAP = 15;

interface Placed {
  x: number; // label anchor x
  y: number; // label anchor y (deconflicted)
  sx: number; // leader start x (slice edge)
  sy: number; // leader start y
  right: boolean;
}

export function OverviewPieChart({
  data,
  nameKey,
  valueKey,
  colorFor,
  height = 240,
  labeled = false,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  colorFor: (name: string) => string;
  height?: number;
  /** Show a deconflicted "<name> <pct>%" label + leader line per slice. */
  labeled?: boolean;
}) {
  const total =
    data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0) || 1;

  // Cache the placed label positions for the current layout (cx/cy/radius): the
  // label callback fires per-slice, but deconfliction needs every slice at once,
  // so we compute them all on the first call and look up by index after.
  const placedRef = useRef<{ key: string; items: Placed[] } | null>(null);

  const place = (cx: number, cy: number, outerR: number): Placed[] => {
    const labelR = outerR + 16;
    let cum = 0;
    const items: Placed[] = data.map((d) => {
      const frac = (Number(d[valueKey]) || 0) / total;
      const midFrac = cum + frac / 2;
      cum += frac;
      const mid = START_ANGLE + (END_ANGLE - START_ANGLE) * midFrac;
      const cos = Math.cos(-mid * RAD);
      const sin = Math.sin(-mid * RAD);
      return {
        x: cx + labelR * cos,
        y: cy + labelR * sin,
        sx: cx + outerR * cos,
        sy: cy + outerR * sin,
        right: cos >= 0,
      };
    });
    // Push overlapping labels down within each side.
    for (const right of [true, false]) {
      const group = items
        .map((it, i) => ({ it, i }))
        .filter((e) => e.it.right === right)
        .sort((a, b) => a.it.y - b.it.y);
      for (let k = 1; k < group.length; k++) {
        const prev = group[k - 1]!.it;
        const cur = group[k]!.it;
        if (cur.y - prev.y < LABEL_GAP) cur.y = prev.y + LABEL_GAP;
      }
    }
    return items;
  };

  const renderLabel = (p: {
    cx?: number;
    cy?: number;
    outerRadius?: number;
    percent?: number;
    name?: string | number;
    index?: number;
  }) => {
    const cx = Number(p.cx) || 0;
    const cy = Number(p.cy) || 0;
    const outerR = Number(p.outerRadius) || 0;
    const idx = Number(p.index) || 0;
    const key = `${cx}:${cy}:${outerR}:${data.length}`;
    if (!placedRef.current || placedRef.current.key !== key) {
      placedRef.current = { key, items: place(cx, cy, outerR) };
    }
    const pos = placedRef.current.items[idx];
    if (!pos) return null;
    const pct = Math.round((Number(p.percent) || 0) * 100);
    const tx = pos.x + (pos.right ? 4 : -4);
    return (
      <g>
        <path
          d={`M${pos.sx},${pos.sy}L${pos.x},${pos.y}`}
          stroke={CHART_THEME.grid}
          fill="none"
        />
        <text
          x={tx}
          y={pos.y}
          fill={CHART_THEME.neutral}
          fontSize={11}
          textAnchor={pos.right ? "start" : "end"}
          dominantBaseline="central"
        >
          {`${p.name} ${pct}%`}
        </text>
      </g>
    );
  };

  return (
    // Static pie: no interactivity, so suppress the browser focus ring / tap
    // highlight that recharts' sectors otherwise show on tap (the blue border).
    <div
      className="[&_:focus]:outline-none [&_:focus-visible]:outline-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            startAngle={START_ANGLE}
            endAngle={END_ANGLE}
            innerRadius="52%"
            outerRadius={labeled ? "66%" : "80%"}
            paddingAngle={2}
            stroke={CHART_THEME.tooltipBg}
            isAnimationActive={false}
            rootTabIndex={-1}
            label={labeled ? renderLabel : false}
            labelLine={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(String(d[nameKey]))} tabIndex={-1} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
