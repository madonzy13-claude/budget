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

export function useViewportFillHeight(ref: RefObject<HTMLElement | null>) {
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
  }, [ref]);
}
