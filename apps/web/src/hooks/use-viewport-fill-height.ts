"use client";
/**
 * use-viewport-fill-height.ts — sizes a scroll container to fill from its own top
 * to the bottom of the viewport, writing `--grid-max-h` on the element (consumed by
 * `h-[var(--grid-max-h,80vh)]`). Extracted from the Spendings grid's proven shell-
 * geometry math so the Overview can ALSO own an inner scroll surface (round 12: the
 * inner scroller keeps the range's sticky out of the page/main scroller, so it stops
 * competing with the pills band — the iOS-standalone two-sticky drop).
 *
 * Architecture (mirrors spendings-grid-client updateMaxH): measured TOP + 100lvh
 * BOTTOM (box extends under the Safari bar; clearance lives in an in-flow tail
 * spacer, since iOS ignores end-of-scroll container padding) + an iOS-browser screen
 * extension. Remeasure is frozen while a field inside is focused (keyboard).
 */
import { useEffect, type RefObject } from "react";
import { computeScreenExtension } from "@/lib/grid-screen-anchor";

/**
 * @param opts.fitVisible size the box to the CURRENTLY-VISIBLE viewport (100svh,
 *   no under-bar extension) instead of 100lvh+ext. Use for pure-vertical inner
 *   scrollers (Overview): the lvh+ext box spills `ext` px past the shell on iOS
 *   Safari, giving the document a second scrollbar on top of the box's own — the
 *   "two scrollers" bug. svh (bar-expanded height) is always ≤ visible, so the box
 *   never spills → single scroll. Stable (not dvh) to avoid resize-jank mid-scroll;
 *   the bar-collapsed gap below is invisible on the dark canvas. The grid keeps the
 *   lvh+ext extension (its scroll surface is meant to run under the bar).
 */
export function useViewportFillHeight(
  ref: RefObject<HTMLElement | null>,
  opts?: { fitVisible?: boolean },
) {
  const fitVisible = opts?.fitVisible ?? false;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const isKeyboardEditing = (): boolean => {
      const a = document.activeElement as HTMLElement | null;
      return !!(
        a &&
        el.contains(a) &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          a.isContentEditable)
      );
    };

    function probeLvhPx(): number {
      const p = document.createElement("div");
      p.style.cssText =
        "position:fixed;top:0;left:0;height:100lvh;width:0;visibility:hidden";
      document.body.appendChild(p);
      const v = Math.round(p.getBoundingClientRect().height) || 0;
      p.remove();
      return v;
    }

    function update() {
      if (!el || isKeyboardEditing()) return;
      const top = Math.max(0, Math.round(el.getBoundingClientRect().top));
      if (fitVisible) {
        // Track the CURRENTLY-VISIBLE viewport so the box always fills exactly from
        // its top to the visible bottom — no under-bar spill (would give the
        // document a 2nd scrollbar) and no gap. iOS collapses the Safari toolbar on
        // ANY scroll (incl. this inner box), which grows visualViewport.height and
        // fires vv resize → we recompute. A static unit can't do this: svh gaps when
        // the bar collapses, lvh spills when it's shown. Fallback to 100svh (no vv).
        const vvh = window.visualViewport?.height;
        el.style.setProperty(
          "--grid-max-h",
          vvh && vvh > 0
            ? `max(160px, ${Math.round(vvh) - top}px)`
            : `max(160px, calc(100svh - ${top}px))`,
        );
        return;
      }
      const isIOS =
        /iP(hone|ad|od)/.test(navigator.platform) ||
        (navigator.userAgent.includes("Mac") && "ontouchend" in document);
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const screenH = portrait ? window.screen.height : window.screen.width;
      const ext = computeScreenExtension({
        screenH,
        lvhPx: probeLvhPx(),
        isCoarsePointer: isCoarse,
        isIOS,
      });
      el.style.setProperty(
        "--grid-max-h",
        `max(160px, calc(100lvh - ${top}px + ${ext}px))`,
      );
    }

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener("resize", update, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update, { passive: true });
    vv?.addEventListener("scroll", update, { passive: true });
    const onFocusOut = () => requestAnimationFrame(update);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [ref, fitVisible]);
}
