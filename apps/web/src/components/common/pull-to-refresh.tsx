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
 * Nested-scroll safety:
 *   - On touchstart we walk up from the touch target looking for the
 *     nearest CSS-scrollable ancestor (overflow-y: auto|scroll). If that
 *     inner container has scrolled past the top (scrollTop > 0), the
 *     user's intent is "scroll within this list" — we bail. This keeps
 *     PTR from fighting the spendings grid's inner gridRef scroll, or
 *     any future inner-scroll container.
 *   - Pull engages only when BOTH the main scroll surface AND the
 *     innermost scrollable are at scrollTop=0.
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
 *     spans header + main). Earlier this hooked `<main>` only, but iOS
 *     touches that start on the `<header>` element never bubbled into
 *     main's touchstart, so pulling from the top nav did nothing — UAT
 *     round 14. The main element is still consulted for `scrollTop` (it's
 *     the real scroll surface; body is locked overflow:hidden) so PTR
 *     still bails when the user has scrolled into the page.
 */

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const PULL_THRESHOLD = 80; // px past which a release triggers a reload
const MAX_PULL = 140; // visual cap on the indicator's downward travel
const DAMPING = 0.5; // half the raw deltaY → rubber-band feel
const INDICATOR_SIZE = 40; // px; matches h-10 / w-10
const MAX_BLUR_PX = 8; // peak background blur (hit at threshold + during refresh)

export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Ref-mirror the pull distance so touchend can read the latest value
  // without re-registering the listener every render.
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  // The innermost scrollable ancestor of the touch target. Captured on
  // touchstart so touchmove can re-check its scrollTop without walking
  // the DOM each frame.
  const innerScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // The gesture surface spans BOTH the header and the main scroll area
    // (see (app)/layout.tsx — `[data-ptr-blur-target]` wraps them). The
    // real scroll surface is still `<main>` (body locked overflow:hidden
    // in global.css), which is what we consult for scrollTop.
    const gestureEl = document.querySelector<HTMLElement>(
      "[data-ptr-blur-target]",
    );
    const mainEl = document.querySelector<HTMLElement>("main");
    if (!gestureEl || !mainEl) return;

    /**
     * Walk up from a touch target to find the nearest CSS-scrollable
     * ancestor. Stops at the gesture wrapper. If none is found (e.g.
     * touches that start in `<header>` — header has no scrollable
     * ancestors before the wrapper), fall through to `mainEl` so the
     * scrollTop guard checks the page scroll surface.
     */
    const findInnerScrollable = (target: EventTarget | null): HTMLElement => {
      let cur = target instanceof Element ? (target as HTMLElement) : null;
      while (cur && cur !== gestureEl) {
        const style = window.getComputedStyle(cur);
        if (
          style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          // overlay/overscroll containers also count
          style.overflowY === "overlay"
        ) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return mainEl;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // Both the outer main AND any inner scroll container must be at
      // the top — otherwise the user's gesture is "scroll within that
      // list", not "pull to refresh".
      const inner = findInnerScrollable(e.target);
      if (mainEl.scrollTop !== 0) return;
      if (inner.scrollTop !== 0) return;
      innerScrollRef.current = inner;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const deltaY = e.touches[0].clientY - startYRef.current;
      const inner = innerScrollRef.current;
      if (
        deltaY <= 0 ||
        mainEl.scrollTop !== 0 ||
        (inner && inner.scrollTop !== 0)
      ) {
        // User swiped up, scrolled past top, or an inner container
        // started scrolling — cancel the pull.
        startYRef.current = null;
        innerScrollRef.current = null;
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
        // Tiny defer so the indicator's final upright frame paints
        // before the reload tears down the document.
        setTimeout(() => window.location.reload(), 120);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
      startYRef.current = null;
      innerScrollRef.current = null;
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
