"use client";

import { useEffect } from "react";

/**
 * ScrollResetOnMount — resets the shell scroll container to the top when
 * the component mounts.
 *
 * Problem (tab-switch residual scroll): the BDP pages share a single
 * `main[data-shell-scroll]` container. Wallets/Home are page-scrolling tabs
 * (content taller than viewport) — the user can scroll the main container.
 * Spendings is an inner-scroll tab: its grid box owns both axes; the MAIN
 * container is NOT supposed to scroll. But client-side tab navigation (Next.js
 * router push via NavLink) does NOT reset scrollTop between route changes, so
 * the scroll position from Wallets survives into Spendings.
 *
 * Effect: after arriving at Spendings from a scrolled Wallets tab, the month
 * navigator ("June 2026") is partially hidden under the pinned pills band
 * because the page is scrolled down. Additionally the grid's
 * getBoundingClientRect().top is measured while the page is scrolled, skewing
 * --grid-max-h (the effect re-runs after reset via ResizeObserver).
 *
 * Fix: reset scrollTop to 0 on mount (one rAF so the DOM is painted first).
 * Renders nothing — purely a mount effect.
 */
export function ScrollResetOnMount() {
  useEffect(() => {
    requestAnimationFrame(() => {
      const main = document.querySelector<HTMLElement>(
        "main[data-shell-scroll]",
      );
      if (main && main.scrollTop !== 0) {
        main.scrollTop = 0;
      }
    });
  }, []);

  return null;
}
