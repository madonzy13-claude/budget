"use client";

/**
 * pie-chart.tsx — themed, responsive Pie wrapper with active-slice highlight (11-02).
 *
 * D-18: tap (mobile) / hover (desktop) reveals the active slice. Hover is native via
 * <Tooltip> + activeShape (the hovered sector enlarges). Tap sets a controlled
 * `activeIndex` that recolors the picked slice to the yellow accent and dims the rest.
 * Colors come from the caller via `colorFor` (Phase-9 UI_TYPE_COLOR-based); the
 * wrapper never imports the palette itself.
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
import { CHART_THEME, chartTooltip } from "./chart-theme";

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
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const total =
    data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0) || 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke={CHART_THEME.tooltipBg}
          isAnimationActive={false}
          // hover enlarge (native, desktop)
          activeShape={(props: { outerRadius?: number }) => (
            <Sector
              {...props}
              outerRadius={(Number(props.outerRadius) || 0) + 6}
            />
          )}
          // tap highlight (mobile): toggle the controlled active slice
          onClick={(_, index) =>
            setActiveIndex((prev) => (prev === index ? undefined : index))
          }
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                i === activeIndex
                  ? CHART_THEME.accent
                  : colorFor(String(d[nameKey]))
              }
              fillOpacity={
                activeIndex === undefined || i === activeIndex ? 1 : 0.45
              }
            />
          ))}
        </Pie>
        <Tooltip
          {...chartTooltip}
          formatter={(value: unknown, name: unknown) => [
            `${(((Number(value) || 0) / total) * 100).toFixed(1)}%`,
            String(name),
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
