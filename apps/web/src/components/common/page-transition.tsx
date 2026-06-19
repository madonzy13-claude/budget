"use client";
/**
 * page-transition.tsx — two-pane directional CAROUSEL for BDP tab content.
 *
 * The outgoing page slides out one way while the incoming page slides in from
 * the other — both live DOM via motion/react. App Router exit animations need
 * the OUTGOING route subtree to keep rendering its OLD content while it animates
 * out, so `FrozenRouter` freezes the router/nav contexts for the exiting copy.
 *
 * ROBUSTNESS (the carousel previously cascaded into blank/black/stuck panes —
 * see git history; this version fixes the two real root causes):
 *   1. FrozenRouter uses `useIsPresent()` (read-only), NEVER `usePresence()`.
 *      usePresence(subscribe=true) registers the child with AnimatePresence and
 *      hands it a `safeToRemove` we never call → exited panes never unmount →
 *      they pile up off-screen and a stale/empty one lands centered → BLACK
 *      screen. useIsPresent only READS presence — no removal gate.
 *   2. The motion key is a per-NAVIGATION counter, not the bare segment. Keying
 *      by segment meant cycling back to a tab (wallets→…→wallets) re-added the
 *      SAME AnimatePresence key while the first copy was still exiting →
 *      collision → a pane stuck off-centre → sustained BLANK. A monotonic key
 *      makes every visit a distinct pane that exits + unmounts cleanly.
 * There is NO loading.tsx on the tab routes (its skeleton-delayed fallback is
 * invisible → looked blank while the RSC loaded) — do not re-add one.
 *
 * Direction from tab order (Wallets→Spendings→Reserves→Settings): forward (new
 * from the right) for a higher index, back (from the left) for lower. The tasks
 * banner is the first child of the pane so it slides WITH the page (no jump).
 * prefers-reduced-motion → instant.
 */
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useIsPresent,
} from "motion/react";
import { useSelectedLayoutSegment } from "next/navigation";
import { useContext, useRef } from "react";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
  PathParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";

const TAB_ORDER = ["wallets", "spendings", "reserves", "settings"];

function tabIndex(segment: string | null): number {
  const i = TAB_ORDER.indexOf(segment ?? "");
  return i < 0 ? 0 : i;
}

function FrozenRouter({ children }: { children: React.ReactNode }) {
  // Freeze router/nav contexts ONLY while exiting (useIsPresent is true for the
  // live page, false once it's leaving), so the exiting copy keeps rendering its
  // OLD route (banner stays on the old page during the slide) while the live page
  // stays fully reactive (the spendings ?month= nav must keep working). MUST be
  // useIsPresent, never usePresence — see the file header.
  const isPresent = useIsPresent();
  const layout = useContext(LayoutRouterContext);
  const pathname = useContext(PathnameContext);
  const searchParams = useContext(SearchParamsContext);
  const params = useContext(PathParamsContext);

  const lastLive = useRef({ layout, pathname, searchParams, params });
  if (isPresent) {
    lastLive.current = { layout, pathname, searchParams, params };
  }
  const v = isPresent
    ? { layout, pathname, searchParams, params }
    : lastLive.current;

  if (!v.layout) return <>{children}</>;

  return (
    <LayoutRouterContext.Provider value={v.layout}>
      <PathnameContext.Provider value={v.pathname}>
        <PathParamsContext.Provider value={v.params}>
          <SearchParamsContext.Provider value={v.searchParams}>
            {children}
          </SearchParamsContext.Provider>
        </PathParamsContext.Provider>
      </PathnameContext.Provider>
    </LayoutRouterContext.Provider>
  );
}

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (dir: number) => ({ x: dir >= 0 ? "-100%" : "100%" }),
};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const reduce = useReducedMotion();

  // Direction from tab-order delta + a MONOTONIC per-navigation key. The key
  // advances only on a real segment change (not on unrelated re-renders), so a
  // re-render keeps the same pane while every navigation — including cycling
  // back to a tab — gets a brand-new key (no same-key AnimatePresence collision).
  const prevIdx = useRef(tabIndex(segment));
  const lastSeg = useRef(segment);
  const navKey = useRef(0);
  const curIdx = tabIndex(segment);
  let dir = curIdx >= prevIdx.current ? 1 : -1;
  if (segment !== lastSeg.current) {
    navKey.current += 1;
    lastSeg.current = segment;
    prevIdx.current = curIdx;
  } else {
    dir = curIdx >= prevIdx.current ? 1 : -1;
  }

  return (
    // CSS-grid STACK: outgoing + incoming live in the SAME cell → they overlap,
    // are top-aligned, and never push each other vertically. grid-cols-[minmax
    // (0,1fr)] pins the cell to container width so the spendings grid's own
    // horizontal scroller stays bounded. overflow-x-clip hides the slide.
    <div className="grid grid-cols-[minmax(0,1fr)] overflow-x-clip">
      <AnimatePresence initial={false} custom={dir}>
        <motion.div
          key={navKey.current}
          className="min-w-0 [grid-area:1/1]"
          custom={dir}
          variants={reduce ? undefined : variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.9, ease: [0.32, 0.72, 0, 1] }
          }
        >
          <FrozenRouter>{children}</FrozenRouter>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
