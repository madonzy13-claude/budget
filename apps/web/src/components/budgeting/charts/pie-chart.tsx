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
import {
  SlotAmount,
  useSlotReveal,
} from "@/components/budgeting/overview/slot-amount";

export function OverviewPieChart({
  data,
  nameKey,
  valueKey,
  colorFor,
  height = 240,
  formatValue,
  formatName,
  allLabel = "All",
  maskValue = false,
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
  /** Privacy: render the centre VALUE as a tap-to-reveal SlotAmount (the % stays
   *  visible). Reveal is shared via SlotRevealProvider. */
  maskValue?: boolean;
}) {
  // hover = transient (desktop); tapped = persistent (mobile). Active is either —
  // so a mobile mouseleave-after-touch can't clear a tapped selection.
  const [hover, setHover] = useState<number | undefined>(undefined);
  const [tapped, setTapped] = useState<number | undefined>(undefined);
  const active = hover ?? tapped;
  // Shared privacy reveal — the centre value toggles it on tap (below).
  const { toggle } = useSlotReveal();

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
        // Masked pies: the centre HOLE toggles the reveal (the disc below), and a
        // slice deselects by re-tapping it — so a background/centre click must
        // NEVER reset here (that was stealing the reveal when the tap landed just
        // off the disc). Non-masked pies keep the click-outside-slice → "All".
        if (maskValue) return;
        const el = e.target as HTMLElement;
        if (!el.closest(".recharts-sector")) {
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
          {/* Reveal hit-target: a clickable disc filling the donut HOLE (the text
              is tiny + the overlay is pointer-events-none, so tapping the amount
              usually missed it and fell through to the reset). Sized to the inner
              radius (55% of maxRadius ≈ 0.55·height for these wide cards) so it
              covers the WHOLE hole — a wide amount overflows a smaller disc, and
              those overflow taps were the ones still landing on the reset. Sits
              BEHIND the read-out text (pointer-events-none), so taps pass through
              to this. The wrapper no longer resets on masked pies either, so even
              an edge tap can't reset. */}
          {maskValue && (
            <button
              type="button"
              aria-label="Toggle amount"
              data-testid="pie-reveal"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              style={{
                width: Math.round(height * 0.55),
                height: Math.round(height * 0.55),
              }}
              className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
            />
          )}
          <span className="pointer-events-none text-caption text-[var(--muted-foreground)]">
            {centreName}
          </span>
          <span className="num pointer-events-none text-num-sm font-semibold text-[var(--body-on-dark)]">
            {(() => {
              const v = formatValue
                ? formatValue(centreVal)
                : String(centreVal);
              return maskValue ? <SlotAmount value={v} /> : v;
            })()}
          </span>
          <span className="pointer-events-none text-caption text-[var(--muted-foreground)]">
            {centrePct}%
          </span>
        </div>
      )}
    </div>
  );
}
