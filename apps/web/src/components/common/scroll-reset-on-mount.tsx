"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/**
 * ScrollResetOnMount — resets ALL scroll roots when arriving at a BDP tab.
 *
 * Scroll-root truth table (verified SHELL-R18, global.css:468-491, layout.tsx:246):
 *
 *   display-mode  | which element scrolls        | what to reset
 *   --------------|------------------------------|-------------------------------
 *   browser       | window / html (document scroll) | window.scrollTo(0,0) + se.scrollTop
 *   standalone    | main[data-shell-scroll]      | main.scrollTop (window already 0)
 *
 * Round 6 miss (quick 260612-t6s): the previous hook reset ONLY
 * main[data-shell-scroll].scrollTop. In browser mode that element is
 * overflow-y:visible (global.css:491), so its scrollTop is structurally always
 * 0 — the reset was a no-op. The real retained scroll lives on window (the
 * html/body document scroll). After a client-side tab switch from a scrolled
 * Wallets page, window.scrollY remained non-zero, keeping the month navigator
 * hidden under the sticky pills band.
 *
 * Fix: reset ALL three roots idempotently inside one rAF, keyed on pathname
 * (useLayoutEffect + rAF so it runs after paint and beats any late Next.js
 * scroll-restoration):
 *   1. window.scrollTo(0, 0)                        — the browser-mode root (the miss)
 *   2. document.scrollingElement.scrollTop = 0      — html/body fallback
 *   3. main[data-shell-scroll].scrollTop = 0        — standalone scroller (belt-and-suspenders)
 *
 * Each write is guarded (already-0 check) so it is idempotent in standalone
 * mode (window already 0, scrollingElement already 0) and in browser mode
 * (main always 0). Mounted only in spendings/page.tsx, so it never fires when
 * the user navigates AWAY to page-scroll tabs (wallets/reserves).
 *
 * Pathname-keying: if the spendings subtree ever shares a persisted layout
 * segment, an on-mount [] effect would not re-run. Keying on pathname guarantees
 * the reset fires on every arrival at the spendings route.
 *
 * Renders nothing — purely a layout effect.
 */
export function ScrollResetOnMount() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => {
      // 1. Window reset — the REAL browser-mode scroll root.
      //    In standalone mode window.scrollY is already 0 (body overflow:hidden),
      //    so this is a harmless no-op there.
      if (typeof window.scrollTo === "function") {
        window.scrollTo(0, 0);
      }

      // 2. document.scrollingElement (html/body) — belt-and-suspenders for
      //    engines where window.scrollTo may be a no-op.
      const se = document.scrollingElement as HTMLElement | null;
      if (se && se.scrollTop !== 0) {
        se.scrollTop = 0;
      }

      // 3. main[data-shell-scroll] — the standalone inner scroller.
      //    In browser mode this element is overflow-y:visible so scrollTop
      //    is always 0; the guard makes this a no-op.
      const main = document.querySelector<HTMLElement>(
        "main[data-shell-scroll]",
      );
      if (main && main.scrollTop !== 0) {
        main.scrollTop = 0;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return null;
}
