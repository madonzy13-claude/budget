"use client";

/**
 * pie-chart.tsx — themed, responsive donut (11-02).
 *
 * "Padding angle + rounded corners" style (gaps between slices, rounded ends).
 * Interactive: hover (desktop) / tap (mobile) shows a tooltip (name · value · %)
 * and highlights the slice (enlarge + dim the rest); a re-tap clears it. Colors
 * come from the caller via `colorFor`; `formatValue` renders the tooltip value.
 */
import { useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector,
  Tooltip,
} from "recharts";
import { chartTooltip } from "./chart-theme";

export function OverviewPieChart({
  data,
  nameKey,
  valueKey,
  colorFor,
  height = 240,
  formatValue,
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  colorFor: (name: string) => string;
  height?: number;
  /** Formats the raw slice value for the tooltip (e.g. cents → "$71,540"). */
  formatValue?: (n: number) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const total =
    data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0) || 1;

  return (
    // Suppress the browser focus ring / tap-highlight recharts otherwise shows on
    // tap (the blue border) — the slice highlight + tooltip carry the feedback.
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
            outerRadius="82%"
            paddingAngle={4}
            cornerRadius={6}
            stroke="none"
            isAnimationActive={false}
            rootTabIndex={-1}
            // Enlarge the hovered/active slice.
            activeShape={(props: { outerRadius?: number }) => (
              <Sector
                {...props}
                outerRadius={(Number(props.outerRadius) || 0) + 6}
              />
            )}
            // Tap toggles a persistent highlight (re-tap the same slice clears it).
            onClick={(_, index) =>
              setActiveIndex((prev) => (prev === index ? undefined : index))
            }
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={colorFor(String(d[nameKey]))}
                fillOpacity={
                  activeIndex === undefined || i === activeIndex ? 1 : 0.4
                }
                tabIndex={-1}
              />
            ))}
          </Pie>
          <Tooltip
            {...chartTooltip}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value) || 0;
              const pct = ((v / total) * 100).toFixed(0);
              const shown = formatValue ? formatValue(v) : String(v);
              return [`${shown} · ${pct}%`, String(name)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
