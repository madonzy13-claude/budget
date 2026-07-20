"use client";

/**
 * pie-chart.tsx — themed, responsive donut (11-02).
 *
 * "Padding angle + rounded corners" style (gaps between slices, rounded ends).
 * Interactive: hover (desktop) / tap (mobile) highlights the slice (enlarge +
 * dim the rest) and shows its "name / value / %" in the donut's CENTRE hole — a
 * center read-out instead of a floating tooltip so it never covers other slices.
 * Interaction is pointer-up based (iOS never fires `click` on the re-rendering
 * chart): ring = select, centre = toggle the masked blur, outside = clear. Colors
 * via `colorFor`; `formatValue` renders the value.
 */
import { useEffect, useRef, useState } from "react";
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
  // Touch devices synthesize a `mouseenter` AFTER the tap (so `hover` re-populates
  // right after pointer-up clears it) and never a real hover — so on touch the
  // selection is `tapped` ALONE; letting `hover` win made a deselected slice keep
  // showing via stale hover. Desktop keeps hover-as-preview over the committed tap.
  // Set after mount to avoid an SSR/hydration mismatch (server can't detect touch).
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(
      typeof window !== "undefined" &&
        ("ontouchstart" in window || navigator.maxTouchPoints > 0),
    );
  }, []);
  const active = isTouch ? tapped : (hover ?? tapped);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Dedupe a double pointer-up from ONE tap (some engines emit both a touch- and a
  // mouse-derived pointerup a few ms apart; without this a re-tap toggles off then
  // straight back on). Uses the event timeStamp — no Date.now.
  const lastUpRef = useRef(-1);
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
      ref={wrapperRef}
      className="relative [&_:focus]:outline-none [&_:focus-visible]:outline-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
      // ALL pie interaction runs on pointer-up, NOT click: iOS Safari never fires a
      // `click` on the chart (the hover re-render swaps the sector element between
      // touchstart and touchend, so the browser cancels the synthesized click),
      // which is why every click-based handler was dead on iOS and the selection —
      // held only by transient `hover` — reset the moment the finger moved to the
      // centre. pointer-up fires on both touch and mouse. By radius:
      //   • centre (the amount or the hole) → toggle the blur, never touch selection
      //   • ring → select the slice under the pointer (re-tap same → deselect)
      //   • outside the donut → reset to "All"
      onPointerUp={(e) => {
        if (e.timeStamp - lastUpRef.current < 60) return; // ignore the twin event
        lastUpRef.current = e.timeStamp;
        const box = wrapperRef.current?.getBoundingClientRect();
        if (!box) return;
        // Resolve what's UNDER the release point directly (elementFromPoint) rather
        // than trusting recharts' hover state — on iOS a fresh tap on another slice
        // doesn't re-fire mouseenter, so a hover-based index stuck on the old slice
        // and switching failed.
        const hit =
          (document.elementFromPoint(
            e.clientX,
            e.clientY,
          ) as HTMLElement | null) ?? (e.target as HTMLElement | null);
        // The amount (incl. a wide value's overflow) → toggle the blur, not select.
        if (hit?.closest?.('[data-testid="slot-amount"]')) {
          if (maskValue) toggle();
          return;
        }
        // On a slice → select THAT slice (its index = its order among the sectors,
        // which is data order). A tap on any other slice therefore always switches.
        const sector = hit?.closest?.(".recharts-sector");
        if (sector) {
          const sectors = Array.from(
            wrapperRef.current?.querySelectorAll(".recharts-sector") ?? [],
          );
          const idx = sectors.indexOf(sector);
          if (idx >= 0) setTapped(idx);
          setHover(undefined);
          return;
        }
        // Neither amount nor slice → the hole or the empty corners, decided by radius.
        const dist = Math.hypot(
          e.clientX - (box.left + box.width / 2),
          e.clientY - (box.top + box.height / 2),
        );
        const R = Math.min(box.width, box.height) / 2;
        if (dist <= 0.55 * R) {
          if (maskValue) toggle(); // centre hole → reveal
          return;
        }
        if (dist > 0.82 * R) {
          setTapped(undefined); // outside the donut → reset to "All"
          setHover(undefined);
        }
        // else: the thin padding gap between slices → keep the current selection
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
            // Desktop hover-preview + dim only (the tap SELECTION is resolved from
            // the release point in onPointerUp). On touch `active` ignores `hover`.
            onMouseEnter={(_, index) => {
              setHover(index);
            }}
            onMouseLeave={() => setHover(undefined)}
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
          <span className="pointer-events-none text-caption text-[var(--muted-foreground)]">
            {centreName}
          </span>
          {/* The masked amount stays pointer-events-auto so the wrapper's pointer-up
              can recognise a tap ON the amount (a wide value overflows the hole onto
              the ring) as a reveal, not a slice select. SlotAmount is NON-interactive
              here (interactive={false}): the pie owns the reveal via pointer-up —
              iOS never fires a click on the chart, and a self-toggling amount would
              double-fire on desktop where both click and pointer-up run. */}
          <span
            className={`num text-num-sm font-semibold text-[var(--body-on-dark)] ${
              maskValue ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            {(() => {
              const v = formatValue
                ? formatValue(centreVal)
                : String(centreVal);
              return maskValue ? (
                <SlotAmount value={v} interactive={false} />
              ) : (
                v
              );
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
