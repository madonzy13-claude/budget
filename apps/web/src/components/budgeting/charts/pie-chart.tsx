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
  outerRing,
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
  /** A second ring OUTSIDE the pie — budget-wide totals that do not line up with
   *  the slices beneath them (the planned-spend pie's needs / wants / investing,
   *  260803). Background only: it never takes a pointer, so the tap-to-select on
   *  the slices inside is untouched. */
  outerRing?: {
    data: Array<Record<string, unknown>>;
    colorFor: (name: string) => string;
    nameKey?: string;
    valueKey?: string;
  };
  /** Privacy: render the centre VALUE as a tap-to-reveal SlotAmount (the % stays
   *  visible). Reveal is shared via SlotRevealProvider. */
  maskValue?: boolean;
}) {
  // hover = transient (desktop); tapped = persistent (mobile). Active is either —
  // so a mobile mouseleave-after-touch can't clear a tapped selection.
  // A selection names its ring as well as its index: both pies put
  // `.recharts-sector` in the DOM, so an index alone is ambiguous (260803).
  type Sel = { ring: boolean; index: number };
  const [hover, setHover] = useState<Sel | undefined>(undefined);
  const [tapped, setTapped] = useState<Sel | undefined>(undefined);
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
  /** The active index within one ring, or undefined when the other ring owns it. */
  const activeIn = (ring: boolean) =>
    active && active.ring === ring ? active.index : undefined;
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
  const hasRing = Boolean(outerRing && outerRing.data.length > 0);
  const ringData = outerRing?.data ?? [];
  const ringNameKey = outerRing?.nameKey ?? "name";
  const ringValueKey = outerRing?.valueKey ?? "value";
  const ringTotal =
    ringData.reduce((sum, d) => sum + (Number(d[ringValueKey]) || 0), 0) || 1;
  const onRing = active?.ring === true;
  const activeRow = active
    ? onRing
      ? ringData[active.index]
      : data[active.index]
    : undefined;
  // Nothing selected → the centre shows the WHOLE pie (All · total · 100%).
  const activeKey = onRing ? ringNameKey : nameKey;
  const centreName = activeRow
    ? onRing
      ? String(activeRow[activeKey])
      : formatName
        ? formatName(String(activeRow[activeKey]))
        : String(activeRow[activeKey])
    : allLabel;
  const centreVal = activeRow
    ? Number(activeRow[onRing ? ringValueKey : valueKey]) || 0
    : rawTotal;
  // A ring arc's share is of the RING, not of the slices — the two happen to sum
  // alike, but the arc's own denominator is the honest one.
  const centrePct = activeRow
    ? ((centreVal / (onRing ? ringTotal : total)) * 100).toFixed(0)
    : "100";

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
          // Within its OWN pie: indexing across every sector on the chart
          // offset each category by the ring's size, so the first slice read
          // out the third (260803).
          // The ring is rendered FIRST, so it is pie 0 whenever there is one.
          // An unknown prop like data-testid cannot mark the group — recharts
          // forwards it onto every Sector instead.
          const pie = sector.closest(".recharts-pie");
          const pies = Array.from(
            wrapperRef.current?.querySelectorAll(".recharts-pie") ?? [],
          );
          const ring = hasRing && pie !== null && pies.indexOf(pie) === 0;
          const sectors = Array.from(
            pie?.querySelectorAll(".recharts-sector") ?? [],
          );
          const idx = sectors.indexOf(sector);
          if (idx >= 0) {
            // Re-tapping the same arc clears it, as the slices already do.
            setTapped((prev) =>
              prev && prev.ring === ring && prev.index === idx
                ? undefined
                : { ring, index: idx },
            );
          }
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
          {outerRing && outerRing.data.length > 0 && (
            <Pie
              data={outerRing.data}
              dataKey={outerRing.valueKey ?? "value"}
              nameKey={outerRing.nameKey ?? "name"}
              innerRadius="88%"
              outerRadius="100%"
              paddingAngle={3}
              cornerRadius={4}
              stroke="none"
              isAnimationActive={false}
              rootTabIndex={-1}
              // recharts forwards this onto each Sector, so it names the arcs,
              // not the group — the group is identified by render order below.
              data-testid="pie-ring-sector"
              // Same enlarge-on-select the slices use, tracking OUR selection.
              shape={(props, index) => (
                <Sector
                  {...props}
                  outerRadius={
                    (Number(props.outerRadius) || 0) +
                    (Number(index) === activeIn(true) ? 5 : 0)
                  }
                />
              )}
              onMouseEnter={(_, index) => setHover({ ring: true, index })}
              onMouseLeave={() => setHover(undefined)}
            >
              {outerRing.data.map((d, i) => (
                <Cell
                  key={`ring-${i}`}
                  fill={outerRing.colorFor(String(d[ringNameKey]))}
                  fillOpacity={
                    active === undefined || (active.ring && active.index === i)
                      ? 1
                      : 0.4
                  }
                  tabIndex={-1}
                />
              ))}
            </Pie>
          )}
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
            // Render EVERY sector ourselves (recharts' activeShape is hover-only in
            // v3) so the enlarge tracks OUR unified `active` — touch tap OR desktop
            // hover. Before this, a tapped slice on mobile dimmed the others but
            // never grew, and a stale internal hover could keep one enlarged after
            // reset. active === undefined → nothing enlarged → clean reset to base.
            shape={(props, index) => (
              <Sector
                {...props}
                outerRadius={
                  (Number(props.outerRadius) || 0) +
                  (Number(index) === activeIn(false) ? 6 : 0)
                }
              />
            )}
            // Desktop hover-preview + dim only (the tap SELECTION is resolved from
            // the release point in onPointerUp). On touch `active` ignores `hover`.
            onMouseEnter={(_, index) => {
              setHover({ ring: false, index });
            }}
            onMouseLeave={() => setHover(undefined)}
          >
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={colorFor(String(d[nameKey]))}
                fillOpacity={
                  active === undefined || (!active.ring && active.index === i)
                    ? 1
                    : 0.4
                }
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
