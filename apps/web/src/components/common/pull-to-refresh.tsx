"use client";

/**
 * pull-to-refresh.tsx — Native-feel pull-to-refresh for every (app) page.
 *
 * Custom touch implementation rather than browser-native PTR because:
 *   - iOS Safari standalone PWA mode does NOT trigger reload on pull-down
 *     (no native PTR indicator); only Android Chrome PWA does.
 *   - <main> in (app)/layout.tsx sets `overscroll-y-none` to kill the
 *     iOS rubber-band bug (S807), which also blocks browsers from firing
 *     their native PTR even on platforms that have one.
 *   - A custom implementation gives us a consistent indicator + blur
 *     progression that matches the rest of the UI on every platform.
 *
 * Mounted ONCE in (app)/layout.tsx so every authenticated route inherits
 * the gesture automatically (no per-page opt-in needed; new pages added
 * to the shell get PTR for free).
 *
 * Scroll position does not matter (user 261023): the pull starts on the
 * header, which sits OUTSIDE every scroller, so a pull there can never be
 * "scroll this list up". The old scrollTop=0 guards dated from when any part
 * of the page could start a pull, and left the header dead once scrolled.
 *
 * Behaviour:
 *   - Touch deltaY is dampened 50% for that elastic "rubber-band" feel.
 *   - Indicator fades + rotates toward upright as the user pulls; once
 *     past the threshold the icon snaps upright and a release reloads.
 *   - Below threshold on release the indicator snaps back to 0.
 *   - --ptr-blur CSS variable on the root element scales 0 → 8px so any
 *     subtree wrapped with `filter: blur(var(--ptr-blur, 0px))` blurs
 *     progressively during the gesture and at peak during the reload.
 *
 * Coverage:
 *   - Touch only; mouse drags are not pull-to-refresh on the web.
 *   - Listener is attached to `[data-ptr-blur-target]` (the wrapper that
 *     spans header + main) so iOS touches that start on the `<header>`
 *     element still register (they never bubble into main's touchstart —
 *     UAT round 14).
 *   - HEADER-ONLY engagement (user 260619): the gesture only triggers when
 *     the pull STARTS on the header (`[data-shell-header]`). Pulling anywhere
 *     below the header (page content / lists) scrolls or does nothing — it
 *     never reloads. (Guard in onTouchStart.)
 */

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

const PULL_THRESHOLD = 80; // px past which a release triggers a reload
const MAX_PULL = 140; // visual cap on the indicator's downward travel
const DAMPING = 0.5; // half the raw deltaY → rubber-band feel
const INDICATOR_SIZE = 40; // px; matches h-10 / w-10
const MAX_BLUR_PX = 8; // peak background blur (hit at threshold + during refresh)

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Pull-to-refresh now REFETCHES the React Query cache instead of doing a hard
  // window.location.reload() (260616). A hard reload offline tore the document
  // down and re-raced the IndexedDB cache restore → the list flashed skeleton
  // then BLANK (the data was cached but lost in the reload). invalidateQueries
  // refreshes data in place: online → SWR refetch updates the cards; offline →
  // React Query pauses the refetch and KEEPS the cached data on screen. Ref-held
  // so the [] touch-listener effect always calls the live client.
  const queryClient = useQueryClient();
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  // Ref-mirror the pull distance so touchend can read the latest value
  // without re-registering the listener every render.
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    // UAT-08: standalone-only. In browser tabs the page scrolls natively
    // (global.css display-mode:browser block) so the platform provides its
    // own pull-to-refresh and bottom-bar collapse; the custom gesture would
    // fight the native one.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        (window.navigator as { standalone?: boolean }).standalone === true);
    if (!standalone) return;

    // The gesture surface spans BOTH the header and the main scroll area
    // (see (app)/layout.tsx — `[data-ptr-blur-target]` wraps them).
    const gestureEl = document.querySelector<HTMLElement>(
      "[data-ptr-blur-target]",
    );
    if (!gestureEl) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Opt-out regions: a gesture that starts inside an element marked
      // [data-no-pull-refresh] (e.g. the spendings grid — it has its own
      // scroll and must never trigger a page reload) does NOT pull-to-refresh.
      // Pulling elsewhere on the page (e.g. the month slider above the grid)
      // still works.
      const startTarget =
        e.target instanceof Element ? (e.target as Element) : null;
      if (startTarget?.closest("[data-no-pull-refresh]")) return;
      // Header-only engagement (user 260619): PTR triggers ONLY when the pull
      // STARTS on the header ([data-shell-header]). A pull that starts below the
      // header (in page content) must never reload — it just scrolls. The
      // listener stays on the header+main wrapper so iOS header touches still
      // register; this guard scopes the gesture to the header.
      if (!startTarget?.closest("[data-shell-header]")) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      if (deltaY <= 0) {
        // User swiped up — cancel the pull.
        startYRef.current = null;
        if (pullRef.current !== 0) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const damped = Math.min(MAX_PULL, deltaY * DAMPING);
      pullRef.current = damped;
      setPull(damped);
      // Block native scroll so the page doesn't try to reveal content
      // above scrollTop=0 (which is impossible) and so iOS doesn't try
      // to rubber-band the document.
      e.preventDefault();
    };

    const onTouchEnd = () => {
      if (startYRef.current !== null && pullRef.current >= PULL_THRESHOLD) {
        setRefreshing(true);
        const offline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline) {
          // Offline a HARD reload tears the cached document → blank (data cached
          // but lost). Keep the SWR refetch (paused by networkMode; cached data
          // stays) + clear the indicator after a beat.
          void qcRef.current.invalidateQueries();
          setTimeout(() => {
            pullRef.current = 0;
            setPull(0);
            setRefreshing(false);
          }, 600);
        } else {
          // Online: a REAL full-page reload (user request) — reloads the document
          // so nothing is stale. The spinner rides until the navigation replaces
          // the page.
          window.location.reload();
        }
      } else {
        pullRef.current = 0;
        setPull(0);
      }
      startYRef.current = null;
    };

    gestureEl.addEventListener("touchstart", onTouchStart, { passive: true });
    gestureEl.addEventListener("touchmove", onTouchMove, { passive: false });
    gestureEl.addEventListener("touchend", onTouchEnd);
    gestureEl.addEventListener("touchcancel", onTouchEnd);

    return () => {
      gestureEl.removeEventListener("touchstart", onTouchStart);
      gestureEl.removeEventListener("touchmove", onTouchMove);
      gestureEl.removeEventListener("touchend", onTouchEnd);
      gestureEl.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Drive --ptr-filter on the root so the wrapper marked with
  // `filter: var(--ptr-filter, none)` blurs progressively as the user
  // pulls. UAT round 17: the previous `--ptr-blur` scheme set
  // `filter: blur(0px)` at rest which created a position:fixed
  // containing block on the wrapper and threw off dnd-kit's
  // <DragOverlay> ghost positioning. Setting the full filter value
  // (and clearing it when at rest) keeps the wrapper transparent to
  // descendant fixed positioning except during an active pull.
  useEffect(() => {
    const ratio = Math.min(1, pull / PULL_THRESHOLD);
    const blurPx = refreshing ? MAX_BLUR_PX : ratio * MAX_BLUR_PX;
    if (blurPx <= 0.001) {
      document.documentElement.style.removeProperty("--ptr-filter");
    } else {
      document.documentElement.style.setProperty(
        "--ptr-filter",
        `blur(${blurPx.toFixed(2)}px)`,
      );
    }
  }, [pull, refreshing]);

  // Always clear on unmount so navigating away from home doesn't leave
  // a residual blur on the next route.
  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--ptr-filter");
    };
  }, []);

  const ratio = Math.min(1, pull / PULL_THRESHOLD);
  const past = pull >= PULL_THRESHOLD;
  // Rotate the icon as the user pulls — full 360° by threshold so it
  // points "up" (reset by transform identity) when releasing triggers
  // refresh. Below threshold it spins gradually; above, lock at 0.
  const iconRotation = past ? 0 : ratio * 360;

  return (
    <div
      aria-hidden={pull === 0 && !refreshing}
      data-testid="pull-to-refresh-indicator"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${Math.max(0, pull - INDICATOR_SIZE - 8)}px)`,
        opacity: refreshing ? 1 : ratio,
        transition: pull === 0 && !refreshing ? "opacity 200ms" : "none",
      }}
    >
      <div
        className="mt-2 flex items-center justify-center rounded-full bg-[var(--canvas-dark)]/95 shadow-lg backdrop-blur"
        style={{ width: INDICATOR_SIZE, height: INDICATOR_SIZE }}
      >
        <RefreshCw
          className={`h-5 w-5 text-[var(--primary)] ${
            refreshing ? "animate-spin" : ""
          }`}
          style={
            refreshing ? undefined : { transform: `rotate(${iconRotation}deg)` }
          }
        />
      </div>
    </div>
  );
}
