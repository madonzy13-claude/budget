"use client";
/**
 * stick-on-scroll.tsx — pins a block to the top of the scroll while scrolled
 * past it, dropping it back to its in-flow slot when scrolled up.
 *
 * Two implementations, chosen by scroll ownership (the SAME signal OverviewTab
 * uses for its inner scroller):
 *
 *  • Inner-box scroll — standalone PWA or desktop (≥640px): a plain
 *    `position: sticky`. Those environments have NO iOS Safari floating bottom
 *    bar, so there's no "black band" to avoid, and native sticky pins reliably
 *    inside the inner scroll surface (fixed-to-<body> does NOT track an inner
 *    scroller — that's why the PWA "wasn't positioning as fixed").
 *
 *  • Mobile-browser page-scroll (<640px, not standalone): `position: fixed`
 *    while pinned, portaled to <body>. HERE a second `position: sticky` in the
 *    page scroll (stacked under the shell header + BDP pills band) makes iOS
 *    Safari refuse to composite its floating bottom-bar backdrop and paint the
 *    bar solid black (confirmed on-device). `fixed` is not a sticky → no band;
 *    the <body> portal escapes the BDP carousel's `transform` (which would
 *    otherwise capture `fixed` and drag the bar off-screen).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** Nearest scrollable ancestor (the inner scroll surface, or null when the page
 *  itself scrolls). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function StickOnScroll({
  children,
  className,
  pinnedClassName,
}: {
  children: ReactNode;
  /** Bar styling (bg, padding) — applied in-flow, sticky AND fixed. */
  className?: string;
  /** Extra classes only while pinned (e.g. a bottom hairline). */
  pinnedClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [stickyTop, setStickyTop] = useState(0);
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, height: 0 });

  // Inner-box scroll (native sticky, no band) in standalone AND on desktop (≥sm);
  // only mobile browser page-scroll uses the fixed workaround.
  const [useBox, setUseBox] = useState(false);
  useEffect(() => {
    const dm = window.matchMedia("(display-mode: standalone)");
    const wide = window.matchMedia("(min-width: 640px)");
    const update = () =>
      setUseBox(
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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = scrollParentOf(el);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const header = document.querySelector<HTMLElement>("[data-shell-header]");
      const band = document.querySelector<HTMLElement>("[data-bdp-tabs]");
      // Stuck offset = the STUCK bottom of the sticky header + pills band, so the
      // bar lands exactly where a `top: 0` sticky would under them.
      const stuck =
        (header ? Math.round(header.getBoundingClientRect().height) : 0) +
        (band ? Math.round(band.getBoundingClientRect().height) : 0);
      // No measurable chrome (isolated tests / not laid out) → never pin.
      if (!stuck) {
        setPinned(false);
        return;
      }
      // Sticky offset is relative to the scroll container's top: 0 when the
      // container already starts below the chrome (inner box), `stuck` when it's
      // the page. `stuck - scrollerTop` covers both and always lands at `stuck`.
      const scrollerTop = scroller
        ? Math.round(scroller.getBoundingClientRect().top)
        : 0;
      const r = el.getBoundingClientRect();
      const nextTop = Math.max(0, stuck - scrollerTop);
      const nextPinned = r.top <= stuck + 1;
      setStickyTop((t) => (t === nextTop ? t : nextTop));
      setPinned((p) => (p === nextPinned ? p : nextPinned));
      setBox((b) =>
        b.top === stuck &&
        b.left === r.left &&
        b.width === r.width &&
        b.height === r.height
          ? b
          : { top: stuck, left: r.left, width: r.width, height: r.height },
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onScroll, { passive: true });
    vv?.addEventListener("scroll", onScroll, { passive: true });
    // Re-measure when the header/band/child resize (install banner, font swap).
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    const header = document.querySelector<HTMLElement>("[data-shell-header]");
    const band = document.querySelector<HTMLElement>("[data-bdp-tabs]");
    if (header) ro.observe(header);
    if (band) ro.observe(band);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      scroller?.removeEventListener("scroll", onScroll);
      vv?.removeEventListener("resize", onScroll);
      vv?.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [useBox]);

  // Inner-box (PWA / desktop): native sticky — no floating bar there, so no band.
  if (useBox) {
    return (
      <div
        ref={ref}
        style={{ position: "sticky", top: stickyTop, zIndex: 30 }}
        className={cn(className, pinned && pinnedClassName)}
      >
        {children}
      </div>
    );
  }

  // Mobile browser page-scroll: fixed-when-pinned, portaled to <body>.
  return (
    <>
      {/* Natural slot: the child in-flow, or a same-height spacer while fixed so
          nothing below jumps. */}
      <div
        ref={ref}
        className={pinned ? undefined : className}
        style={pinned ? { height: box.height } : undefined}
        aria-hidden={pinned || undefined}
      >
        {pinned ? null : children}
      </div>
      {pinned &&
        createPortal(
          <div
            className={cn(className, pinnedClassName)}
            style={{
              position: "fixed",
              top: box.top,
              left: box.left,
              width: box.width,
              zIndex: 30,
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
