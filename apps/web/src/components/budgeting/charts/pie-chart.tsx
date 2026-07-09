"use client";

/**
 * pie-chart.tsx — themed, responsive donut (11-02).
 *
 * "Pie with padding angle + rounded corners" style: gaps between slices
 * (paddingAngle) and rounded slice ends (cornerRadius). Static — no tap
 * highlight, no tooltip, no on-slice labels. Colors come from the caller via
 * `colorFor`.
 */
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export function OverviewPieChart({
  data,
  nameKey,
  valueKey,
  colorFor,
  height = 240,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  colorFor: (name: string) => string;
  height?: number;
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
            outerRadius="85%"
            paddingAngle={4}
            cornerRadius={6}
            stroke="none"
            isAnimationActive={false}
            rootTabIndex={-1}
            label={false}
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
