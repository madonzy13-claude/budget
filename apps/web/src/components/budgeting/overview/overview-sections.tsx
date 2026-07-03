"use client";
/**
 * overview-sections.tsx — owns the shared Overview range + the four collapsible
 * sections (Planned · Overspent · Reserves · Financial Wealth).
 *
 * Range pinning (round 12): the row is `position: sticky; top: 0` INSIDE the
 * Overview's own inner scroll surface (OverviewTab) — so it pins to that container,
 * not the page/main scroller, and therefore never competes with the pills band's
 * sticky (the iOS-standalone two-sticky drop). `border-b` shows ONLY while pinned
 * (round 12 item 2); pinned = the row reached the scroller's top.
 */
import { useState, useRef, useEffect } from "react";
import { RangeSelector } from "./range-selector";
import { PlannedSection } from "./planned-section";
import { OverspentReservesSection } from "./overspent-reserves-section";
import { WealthSection } from "./wealth-section";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { cn } from "@/lib/utils";
import {
  makeRange,
  DEFAULT_RANGE_PRESET,
  type OverviewRange,
} from "@/lib/overview-range";

/** Nearest scrollable ancestor (the OverviewTab inner scroll surface). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function OverviewSections({
  budgetId,
  reservesEnabled = true,
  investmentsEnabled = true,
}: {
  budgetId: string;
  reservesEnabled?: boolean;
  investmentsEnabled?: boolean;
}) {
  // Range persists across pill navigation via the BDP store (item 4): seed from
  // it on mount, write back on every change.
  const store = useBdpUiStore();
  // Current-month default rolls over in the user's timezone, not UTC (r31 item 1).
  const tz = useUserTimezone();
  const [range, setRange] = useState<OverviewRange>(
    () => store?.overview.range ?? makeRange(DEFAULT_RANGE_PRESET, tz),
  );
  const applyRange = (r: OverviewRange) => {
    if (store) store.overview.range = r;
    setRange(r);
  };
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const scroller = scrollParentOf(el);
    if (!el || !scroller) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      setPinned(
        el.getBoundingClientRect().top <=
          scroller.getBoundingClientRect().top + 1,
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex flex-col gap-3" data-testid="overview-sections">
      <div
        ref={ref}
        data-overview-range-sticky
        data-pinned={pinned ? "true" : "false"}
        style={{ position: "sticky", top: 0, zIndex: 30 }}
        className={cn(
          "-mx-4 bg-[var(--canvas-dark)] px-4 py-2",
          // Desktop/tablet: full-bleed to the pane edges so the pinned border spans
          // full width like the pills band (item 6). The content centers at 1280, so
          // the plain -mx only reached that edge; calc(-50vw+50%) breaks out to the
          // viewport without position tricks (keeps `sticky`). Phones (<sm) keep
          // -mx-4 — untouched, so the iOS-standalone pinning path is unchanged.
          "sm:mx-[calc(-50vw_+_50%)] sm:w-screen sm:px-6",
          // No horizontal line until it pins (item 2).
          pinned && "border-b border-[var(--hairline-dark)]",
        )}
      >
        <RangeSelector value={range} onChange={applyRange} />
      </div>
      <PlannedSection budgetId={budgetId} range={range} />
      <OverspentReservesSection
        budgetId={budgetId}
        range={range}
        reservesEnabled={reservesEnabled}
      />
      <WealthSection
        budgetId={budgetId}
        range={range}
        investmentsEnabled={investmentsEnabled}
      />
    </div>
  );
}
