"use client";

/**
 * pie-chart.tsx — themed, responsive Pie wrapper (11-02).
 *
 * Static: no tap highlight, no tooltip — the customized "<name> <pct>%" labels carry
 * the read-out. Colors come from the caller via `colorFor` (Phase-9 UI_TYPE_COLOR-
 * based); the wrapper never imports the palette itself.
 */
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CHART_THEME } from "./chart-theme";

const RAD = Math.PI / 180;

/** Customized label: draws "<name> <pct>%" just outside each slice. Slices under
 *  3% get NO label — their leader lines would otherwise stack and overlap when a
 *  few tiny slices sit next to each other (the colour arc still shows in the ring). */
function renderTypePercentLabel(p: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  percent?: number;
  name?: string | number;
}) {
  const pct = Math.round((Number(p.percent) || 0) * 100);
  if (pct < 3) return null;
  const cx = Number(p.cx) || 0;
  const cy = Number(p.cy) || 0;
  const mid = Number(p.midAngle) || 0;
  const r = (Number(p.outerRadius) || 0) + 14;
  const x = cx + r * Math.cos(-mid * RAD);
  const y = cy + r * Math.sin(-mid * RAD);
  return (
    <text
      x={x}
      y={y}
      fill={CHART_THEME.neutral}
      fontSize={11}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {`${p.name} ${pct}%`}
    </text>
  );
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
  /** Show a customized label ("<type> <pct>%") outside each slice. */
  labeled?: boolean;
}) {
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
            innerRadius="55%"
            outerRadius={labeled ? "70%" : "80%"}
            paddingAngle={2}
            stroke={CHART_THEME.tooltipBg}
            isAnimationActive={false}
            rootTabIndex={-1}
            label={labeled ? renderTypePercentLabel : undefined}
            labelLine={labeled ? { stroke: CHART_THEME.grid } : false}
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
