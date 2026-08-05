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
      // A viewport measured while the app is in the BACKGROUND is a reading for
      // a window nobody is looking at. Leave the app with another one's keyboard
      // up and iOS hands the PWA a visualViewport still short by that keyboard;
      // sizing the box to it left a black band of bare canvas exactly where the
      // keyboard had been, and it stayed until something else resized (user
      // report, 260805). Coming back to the front re-measures — see below.
      if (typeof document !== "undefined" && document.hidden) return;
      const zoom = zoomFactor(el);
      const top = Math.max(0, Math.round(unscrolledTop(el) / zoom));
      if (fitVisible) {
        // Track the CURRENTLY-VISIBLE viewport so the box always fills exactly from
        // its top to the visible bottom — no under-bar spill (would give the
        // document a 2nd scrollbar) and no gap. iOS collapses the Safari toolbar on
        // ANY scroll (incl. this inner box), which grows visualViewport.height and
        // fires vv resize → we recompute. A static unit can't do this: svh gaps when
        // the bar collapses, lvh spills when it's shown. Fallback to 100svh (no vv).
        // Both readings are SCREEN pixels, so the subtraction happens there and
        // the result is converted into the element's own space — a px length it
        // carries is multiplied by the zoom on the way back out. Getting this
        // wrong sized the box zoom× too tall and left a black band of bare
        // document under the shell (user report, 260802).
        //
        // visualViewport is the VISIBLE window onto the layout viewport, and
        // pinch/page-scale zoom shrinks it while the layout viewport — the frame
        // this box is laid out in — stays put. Multiplying by the page scale
        // reads it back in layout pixels. Without it a page scaled 1.595× sized
        // the box 209px inside a 516px-tall layout viewport and left 193px of
        // bare canvas beneath it, more the further the user zoomed (their own
        // console numbers, 260802). Unpinched the scale is 1, so the iOS
        // bar-collapse tracking below is untouched.
        //
        // 100svh is a FLOOR under the measured value, and it is what makes a
        // stale measurement harmless (user report, 260805). svh is the viewport
        // with every dynamic toolbar SHOWN — the smallest the visible area can
        // legitimately be — so the box is never shorter than that, whatever
        // visualViewport happens to say. A reading still carrying the keyboard
        // of the app you just came back from simply falls under the floor and
        // is ignored, with no window to time and no state to keep. The measured
        // value still wins when it is TALLER, which is the case this branch
        // exists for: the iOS bar collapsing gives back height that no static
        // unit can see.
        const vv = window.visualViewport;
        const vvh = vv ? vv.height * (vv.scale || 1) : window.innerHeight;
        const floor = `calc(100svh - ${top}px)`;
        el.style.setProperty(
          "--grid-max-h",
          vvh > 0
            ? `max(160px, ${floor}, ${Math.round(vvh / zoom - top)}px)`
            : `max(160px, ${floor})`,
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

    // Coming back to the front, once now and once after the keyboard's dismissal
    // animation — iOS does not always send a resize when it finally lets that
    // space go. Neither pass can do harm: the floor in update() means a
    // measurement taken too early cannot shorten the box.
    let timers: ReturnType<typeof setTimeout>[] = [];
    const onVisible = () => {
      if (document.hidden) return;
      // Flick between apps a few times and each resume would otherwise leave
      // its own timers behind.
      timers.forEach(clearTimeout);
      timers = [];
      update();
      timers.push(setTimeout(update, 400));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      el.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      timers.forEach(clearTimeout);
    };
  }, [ref, fitVisible]);
}
