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
import { useRef, useState } from "react";
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
  // Was the CURRENT press inside the donut hole? Recorded on pointer-down (capture
  // phase, before recharts) so the Pie's onClick can IGNORE a hole tap. On iOS
  // Safari a tap in the hole is routed by recharts to the nearest sector and fires
  // that sector's onClick → it toggled the selected slice off ("centre tap resets
  // to All"). Chromium never routed a hole tap to a sector, which is why this only
  // reproduced on WebKit. The hole is served by the reveal disc / amount; recharts
  // must not treat a hole press as a slice click at all.
  const pressInHoleRef = useRef(false);
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
      // Record whether the press landed inside the donut HOLE, in the capture phase
      // so it's set before recharts' own handlers run. innerRadius = 55% of the pie
      // maxRadius (min(w,h)/2). A hole press must never change the slice selection.
      onPointerDownCapture={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height / 2);
        const innerR = (0.55 * Math.min(box.width, box.height)) / 2;
        pressInHoleRef.current = Math.hypot(dx, dy) <= innerR;
      }}
      // Click OUTSIDE a slice (the hole / empty area) resets to "All". A click ON a
      // slice is handled by the Pie's onClick (re-tapping the same slice clears it).
      // Clear hover too: on touch a tap leaves `hover` set (no mouseleave fires), so
      // clearing only `tapped` would leave `active = hover` still showing the slice.
      onClick={(e) => {
        // Reset to "All" ONLY when the tap is OUTSIDE the donut's outer circle (the
        // chart corners / empty area). ANY tap INSIDE the circle keeps the current
        // selection: the centre amount toggles its own blur (SlotAmount), the hole
        // toggles it via the disc, and a slice deselects itself by a re-tap through
        // the Pie's own onClick. This is the robust rule — it doesn't depend on the
        // amount's width vs the hole (a wide amount overflowing onto the ring no
        // longer counts as a slice tap). Center ≈ the chart box center (the pie is
        // centered in the container); outer radius = the 82% Pie outerRadius.
        const box = e.currentTarget.getBoundingClientRect();
        const dx = e.clientX - (box.left + box.width / 2);
        const dy = e.clientY - (box.top + box.height / 2);
        const outerR = (0.82 * Math.min(box.width, box.height)) / 2;
        if (Math.hypot(dx, dy) <= outerR) return; // inside the circle → keep it
        setTapped(undefined);
        setHover(undefined);
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
              // Ignore a click whose press was in the HOLE — on iOS recharts routes
              // a hole tap to the nearest sector and fires this, which would toggle
              // the selected slice off (the "centre tap resets" bug). The hole is
              // the reveal target, never a slice click.
              if (pressInHoleRef.current) return;
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
          {/* The masked amount is its OWN tap target (pointer-events-auto): a wide
              value overflows the donut hole onto the ring, and a pointer-events-none
              amount let those overflow taps fall THROUGH to the slice underneath —
              recharts then re-selected/cleared the slice instead of toggling the
              blur (the reported "jumps to All, still blurred" bug). SlotAmount's own
              onClick stops propagation + toggles, and being on top it swallows the
              tap so the sector never sees it. */}
          <span
            className={`num text-num-sm font-semibold text-[var(--body-on-dark)] ${
              maskValue ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
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
