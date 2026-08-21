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
 * @param opts.fitVisible size the box to the LAYOUT viewport instead of
 *   100lvh+ext. Use for pure-vertical inner scrollers (Overview): the lvh+ext
 *   box spills `ext` px past the shell on iOS Safari, giving the document a
 *   second scrollbar on top of the box's own — the "two scrollers" bug. The
 *   layout viewport is exactly the frame the box lives in, so it never spills
 *   and never falls short, and — unlike visualViewport — no keyboard can move
 *   it (see the branch for both black-band sagas). The grid keeps the lvh+ext
 *   extension (its scroll surface is meant to run under the bar).
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

    /**
     * Page zoom scales every px length the element carries, while a rect and
     * visualViewport keep reporting SCREEN pixels. Dividing by the ratio between
     * the two puts our numbers back in the element's own space — without it a
     * zoomed Overview sized its box zoom× too tall and left a black band of
     * empty document below the shell (user report, 260802). Unzoomed = 1.
     */
    function zoomFactor(node: HTMLElement): number {
      const w = node.getBoundingClientRect().width;
      const local = node.offsetWidth;
      return w > 0 && local > 0 ? w / local : 1;
    }

    /**
     * The element's top with every scroller between it and the viewport wound
     * back to zero. A rect's `top` is viewport-RELATIVE, so once the page under
     * the box scrolls it reads smaller — and a box sized "viewport minus my top"
     * GREW, which made the document taller, which allowed more scroll: a runaway
     * that left a black band of bare document below the shell, worse the further
     * you zoomed (user report, 260802). Summing the ancestors' scrollTop undoes
     * exactly that, and leaves an unscrolled page reading the same as before.
     */
    function unscrolledTop(node: HTMLElement): number {
      let top = node.getBoundingClientRect().top;
      for (let n = node.parentElement; n; n = n.parentElement) {
        top += n.scrollTop;
      }
      return top;
    }

    function update() {
      if (!el || isKeyboardEditing()) return;
      // Nothing is measured for a window nobody is looking at. Neither branch
      // reads the viewport imperatively any more, but a backgrounded page can
      // still report a rect of zeros, and a `top` of 0 would size the box to the
      // whole screen and let the document scroll past the shell.
      if (typeof document !== "undefined" && document.hidden) return;
      const zoom = zoomFactor(el);
      const top = Math.max(0, Math.round(unscrolledTop(el) / zoom));
      if (fitVisible) {
        // The LAYOUT viewport — `documentElement.clientHeight` — which is the
        // frame this box is laid out in, and the only viewport the iOS keyboard
        // does not touch. That separation is the entire reason visualViewport
        // exists as a distinct thing.
        //
        // This box used to read `visualViewport.height` so it could follow iOS
        // Safari collapsing its toolbar. But that is exactly the reading the
        // KEYBOARD moves, and iOS hands a resumed PWA one still short by the
        // keyboard of the app you just left — for as long as it likes. Two
        // rounds of settling windows tried to out-wait it (260805) and could
        // not: whatever they write when the window closes comes from the same
        // lie, and the short box then stays, because nothing resizes again. The
        // user's black band survived until the app was killed (260821).
        //
        // …but the layout viewport ALONE is not enough either. In the installed
        // PWA it comes back short of the window, and a box sized off it left a
        // permanent strip of black under the last card on every view of the
        // Overview while page-scrolled tabs reached the screen edge (user,
        // 260821). `100svh` was tried first and did exactly the same thing —
        // same short number, so do not reach for it again.
        //
        // Take whichever of the two is TALLER. The two failures are
        // one-directional and opposite: a keyboard can only ever SHRINK the
        // visual viewport, so a stale one can never win a max(); and only the
        // visual viewport knows about space the layout viewport is not being
        // told about. This is NOT the "grow but never shrink" ratchet that
        // failed in 260805 — both readings are live, and the box follows them
        // down again the moment they drop.
        //
        // All of them are SCREEN pixels, so the subtraction happens there and
        // the result is converted into the element's own space — a px length it
        // carries is multiplied by the zoom on the way back out. Getting this
        // wrong sized the box zoom× too tall and left a black band of bare
        // document under the shell (user report, 260802).
        const layoutH =
          document.documentElement.clientHeight || window.innerHeight;
        const vv = window.visualViewport;
        const visualH = vv ? vv.height * (vv.scale || 1) : 0;
        const fillH = Math.max(layoutH, visualH);
        el.style.setProperty(
          "--grid-max-h",
          fillH > 0
            ? `max(160px, ${Math.round(fillH / zoom - top)}px)`
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

    // No resume handler: there is nothing to re-take. Both branches are CSS
    // viewport units plus a measured top, and a rotation while the app was away
    // changes the element's width, which the ResizeObserver above already
    // catches. The settling window this replaces existed only to out-wait a
    // visualViewport reading neither branch takes any more (260821).

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [ref, fitVisible]);
}
