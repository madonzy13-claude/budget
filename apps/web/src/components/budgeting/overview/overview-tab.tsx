"use client";
/**
 * overview-tab.tsx — the Overview BDP tab body (Phase 11, 11-08).
 *
 * Round 12: the Overview now owns its OWN inner scroll surface (like the Spendings
 * grid). WHY: the range selector's `position: sticky` then pins to THIS container
 * instead of the page/main scroller, so it no longer competes with the pills band's
 * sticky — which iOS-standalone dropped on deep scroll (two stickies in the inner
 * main scroller). The container fills from its top to the viewport bottom via
 * useViewportFillHeight (`--grid-max-h`); clearance lives in the in-flow tail spacer
 * (iOS ignores end-of-scroll container padding). Its wrapper carries
 * data-no-page-clearance so the shell zeroes the page-level bottom pad.
 */
import { useEffect, useRef } from "react";
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";
import { OverviewSections } from "@/components/budgeting/overview/overview-sections";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useViewportFillHeight } from "@/hooks/use-viewport-fill-height";
import { restoreScroll } from "@/lib/restore-scroll";

export function OverviewTab({
  budgetId,
  reservesEnabled = true,
  investmentsEnabled = true,
}: {
  budgetId: string;
  reservesEnabled?: boolean;
  investmentsEnabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useViewportFillHeight(scrollRef);

  // Persist this scroller's position across pill navigation (item 4): restore the
  // saved offset once laid out (rAF, after useViewportFillHeight sizes the box),
  // and keep writing it as the user scrolls / on unmount.
  const store = useBdpUiStore();
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !store) return;
    const cancel = restoreScroll(el, { top: store.overview.scrollTop ?? 0 });
    const onScroll = () => {
      store.overview.scrollTop = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancel();
      el.removeEventListener("scroll", onScroll);
    };
  }, [store]);

  return (
    <div
      ref={scrollRef}
      data-testid="overview-tab"
      data-no-pull-refresh=""
      style={{ overscrollBehavior: "none" }}
      // overflow-x-clip so the desktop full-bleed range band (item 6) can't add a
      // horizontal scrollbar; vertical scroll is the whole full-width surface (item 9).
      className="h-[var(--grid-max-h,80vh)] overflow-y-auto overflow-x-clip"
    >
      <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4 px-4 pt-4 sm:px-6">
        <OverviewCards
          budgetId={budgetId}
          reservesEnabled={reservesEnabled}
          investmentsEnabled={investmentsEnabled}
        />
        <OverviewSections
          budgetId={budgetId}
          reservesEnabled={reservesEnabled}
          investmentsEnabled={investmentsEnabled}
        />
      </div>
      {/* iOS end-of-scroll clearance spacer (env+64 standalone; global.css
          [data-grid-tail-spacer] overrides to env+96 in browser). */}
      <div
        aria-hidden
        data-grid-tail-spacer
        className="h-[calc(env(safe-area-inset-bottom,0px)+64px)] w-full shrink-0"
      />
    </div>
  );
}
