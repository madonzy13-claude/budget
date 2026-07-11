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
import { useEffect, useRef, useState } from "react";
import { OverviewCards } from "@/components/budgeting/overview/overview-cards";
import { ProjectionTimeline } from "@/components/budgeting/overview/projection-timeline";
import { OverviewSections } from "@/components/budgeting/overview/overview-sections";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useViewportFillHeight } from "@/hooks/use-viewport-fill-height";
import { restoreScroll } from "@/lib/restore-scroll";
import { cn } from "@/lib/utils";

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
  // Scroll ownership by display mode (the iOS-Safari "two scrollbars + dead band"
  // fix). STANDALONE (PWA): own an inner scroll surface (fixed height) so the
  // range's `position: sticky` pins to THIS box and never competes with the pills
  // band — the iOS-standalone two-sticky drop; PWA works fine this way. BROWSER
  // (Safari tab): the PAGE must scroll natively (global.css display-mode:browser
  // makes html/body/shell the scroll surface) so iOS collapses its bottom bar and
  // hands the content the full screen. An inner scroller there leaves the page's
  // 100lvh−visible gap as dead space → a 2nd scrollbar + a dark band beneath the
  // box (UAT-08). Default false (page-scroll) so a browser tab never first-paints
  // the fixed-height box; flip to inner-scroll only once we confirm standalone.
  // Own an inner scroll surface in STANDALONE (the iOS-Safari fix) AND on DESKTOP
  // (≥sm): a fixed-height box means the pinned range selector engages immediately
  // like on mobile, instead of only after enough page scroll — on a tall desktop
  // the page often can't scroll far enough to reach the pin, so it never sticks.
  // Only mobile browser (<sm, touch) keeps native page-scroll (iOS bar-collapse).
  const [innerScroll, setInnerScroll] = useState(false);
  useEffect(() => {
    const dm = window.matchMedia("(display-mode: standalone)");
    const wide = window.matchMedia("(min-width: 640px)");
    const update = () =>
      setInnerScroll(
        dm.matches ||
          (navigator as { standalone?: boolean }).standalone === true ||
          wide.matches,
      );
    update();
    dm.addEventListener("change", update);
    wide.addEventListener("change", update);
    return () => {
      dm.removeEventListener("change", update);
      wide.removeEventListener("change", update);
    };
  }, []);
  // Only meaningful for inner-scroll (the h-[--grid-max-h] class); a no-op var
  // otherwise. fitVisible tracks the visible viewport height for the PWA box.
  useViewportFillHeight(scrollRef, { fitVisible: true });

  // Persist this scroller's position across pill navigation (item 4): restore the
  // saved offset once laid out (rAF, after useViewportFillHeight sizes the box),
  // and keep writing it as the user scrolls / on unmount.
  const store = useBdpUiStore();
  useEffect(() => {
    const el = scrollRef.current;
    // Only the inner-scroll (standalone) box is the scroller; in page-scroll mode
    // its scrollTop is always 0 and the page scroll is persisted by BudgetDetail.
    if (!el || !store || !innerScroll) return;
    const cancel = restoreScroll(el, { top: store.overview.scrollTop ?? 0 });
    const onScroll = () => {
      store.overview.scrollTop = el.scrollTop;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancel();
      el.removeEventListener("scroll", onScroll);
    };
  }, [store, innerScroll]);

  return (
    <div
      ref={scrollRef}
      data-testid="overview-tab"
      data-no-pull-refresh=""
      style={innerScroll ? { overscrollBehavior: "none" } : undefined}
      // overflow-x-clip so the desktop full-bleed range band (item 6) can't add a
      // horizontal scrollbar. STANDALONE: fixed-height inner scroller. BROWSER:
      // no height/overflow-y → content flows into the page, which scrolls natively
      // (lets iOS Safari collapse its bar → full screen, no dead band).
      className={cn(
        "overflow-x-clip",
        innerScroll && "h-[var(--grid-max-h,80vh)] overflow-y-auto",
      )}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-4 px-4 pt-4 sm:px-6">
        <OverviewCards
          budgetId={budgetId}
          reservesEnabled={reservesEnabled}
          investmentsEnabled={investmentsEnabled}
        />
        <ProjectionTimeline budgetId={budgetId} />
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
