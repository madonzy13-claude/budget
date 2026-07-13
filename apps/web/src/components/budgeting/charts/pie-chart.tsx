"use client";

/**
 * pie-chart.tsx — themed, responsive donut (11-02).
 *
 * "Padding angle + rounded corners" style (gaps between slices, rounded ends).
 * Interactive: hover (desktop) / tap (mobile) highlights the slice (enlarge +
 * dim the rest) and shows its "name / value / %" in the donut's CENTRE hole — a
 * center read-out instead of a floating tooltip so it never covers other slices.
 * Re-tap the same slice clears it. Colors via `colorFor`; `formatValue` renders
 * the value.
 */
import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Sector } from "recharts";

export function OverviewPieChart({
  data,
  nameKey,
  valueKey,
  colorFor,
  height = 240,
  formatValue,
  formatName,
  allLabel = "All",
}: {
  data: Array<Record<string, unknown>>;
  nameKey: string;
  valueKey: string;
  colorFor: (name: string) => string;
  height?: number;
  /** Formats the raw slice value for the centre read-out (e.g. cents → "$71,540"). */
  formatValue?: (n: number) => string;
  /** Formats the raw slice name for the centre read-out (e.g. "cash_fx" → "Cash").
   *  colorFor still receives the raw name, so colours stay keyed off the raw value. */
  formatName?: (name: string) => string;
  /** Centre label shown when NO slice is selected — the whole pie (total · 100%). */
  allLabel?: string;
}) {
  // hover = transient (desktop); tapped = persistent (mobile). Active is either —
  // so a mobile mouseleave-after-touch can't clear a tapped selection.
  const [hover, setHover] = useState<number | undefined>(undefined);
  const [tapped, setTapped] = useState<number | undefined>(undefined);
  const active = hover ?? tapped;

  const total =
    data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0) || 1;

  const rawTotal = data.reduce((sum, d) => sum + (Number(d[valueKey]) || 0), 0);
  const activeRow = active !== undefined ? data[active] : undefined;
  // Nothing selected → the centre shows the WHOLE pie (All · total · 100%).
  const centreName = activeRow
    ? formatName
      ? formatName(String(activeRow[nameKey]))
      : String(activeRow[nameKey])
    : allLabel;
  const centreVal = activeRow ? Number(activeRow[valueKey]) || 0 : rawTotal;
  const centrePct = activeRow ? ((centreVal / total) * 100).toFixed(0) : "100";

  return (
    // relative → the centre read-out overlays the hole. Suppress the browser focus
    // ring / tap-highlight recharts otherwise shows on tap (the blue border).
    <div
      className="relative [&_:focus]:outline-none [&_:focus-visible]:outline-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
      // Click OUTSIDE a slice (the hole / empty area) resets to "All". A click ON a
      // slice is handled by the Pie's onClick (re-tapping the same slice clears it).
      // Clear hover too: on touch a tap leaves `hover` set (no mouseleave fires), so
      // clearing only `tapped` would leave `active = hover` still showing the slice.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".recharts-sector")) {
          setTapped(undefined);
          setHover(undefined);
        }
      }}
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
            activeShape={(props: { outerRadius?: number }) => (
              <Sector
                {...props}
                outerRadius={(Number(props.outerRadius) || 0) + 6}
              />
            )}
            onMouseEnter={(_, index) => setHover(index)}
            onMouseLeave={() => setHover(undefined)}
            onClick={(_, index) => {
              // Clear any lingering (touch) hover so re-tapping the SAME slice
              // reliably falls back to "All" instead of `active` reading `hover`.
              setHover(undefined);
              setTapped((prev) => (prev === index ? undefined : index));
            }}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={colorFor(String(d[nameKey]))}
                fillOpacity={active === undefined || i === active ? 1 : 0.4}
                tabIndex={-1}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {data.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-caption text-[var(--muted-foreground)]">
            {centreName}
          </span>
          <span className="num text-num-sm font-semibold text-[var(--body-on-dark)]">
            {formatValue ? formatValue(centreVal) : String(centreVal)}
          </span>
          <span className="text-caption text-[var(--muted-foreground)]">
            {centrePct}%
          </span>
        </div>
      )}
    </div>
  );
}
