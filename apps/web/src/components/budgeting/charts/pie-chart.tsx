"use client";

/**
 * pie-chart.tsx — themed, responsive Pie wrapper (11-02).
 *
 * Static: no tap highlight, no tooltip. When `labeled`, every slice is named in a
 * LEGEND below the ring ("<swatch> <name> <pct>%") — a legend (not on-slice
 * labels) so a few tiny adjacent slices never overlap and NO label is skipped.
 * Colors come from the caller via `colorFor`; the wrapper never imports the
 * palette itself.
 */
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CHART_THEME } from "./chart-theme";

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
  /** Show a legend (swatch + "<name> <pct>%") for every slice below the ring. */
  labeled?: boolean;
}) {
  const total =
    data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0) || 1;

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
            outerRadius="80%"
            paddingAngle={2}
            stroke={CHART_THEME.tooltipBg}
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

      {labeled && (
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {data.map((d, i) => {
            const name = String(d[nameKey]);
            const pct = Math.round(((Number(d[valueKey]) || 0) / total) * 100);
            return (
              <li
                key={i}
                className="inline-flex items-center gap-1.5 text-caption text-[var(--muted-foreground)]"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: colorFor(name) }}
                />
                {`${name} ${pct}%`}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
