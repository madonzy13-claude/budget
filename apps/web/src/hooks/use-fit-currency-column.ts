"use client";

import { useEffect, type RefObject } from "react";

// The currency field around its label: px-3 padding (24) + the gap before the
// chevron (8) + the chevron (16) + the 1px border each side (2).
const CHROME_PX = 50;
// gap-2 between code · name · symbol inside the label.
const LABEL_GAP_PX = 8;

/**
 * Sizes the desktop currency column to the longest SELECTED label in the list
 * (261102, user: the fixed 224px dropdown was far too wide). Sets `--ccy-w` on
 * the container; the pickers' wrappers read it at `md:` and up. Measured, not
 * guessed: each `[data-ccy-label]` part's natural width (`scrollWidth` — the
 * name truncates, so the label's own box would only report what is shown).
 * Re-measures when rows or picks change and once web fonts have loaded.
 */
export function useFitCurrencyColumn(ref: RefObject<HTMLElement | null>) {
  // No deps: the list mounts after its data loads, so re-attach each render.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let max = 0;
      for (const label of el.querySelectorAll<HTMLElement>(
        "[data-ccy-label]",
      )) {
        const parts = [...label.children] as HTMLElement[];
        const w =
          parts.reduce((sum, p) => sum + p.scrollWidth, 0) +
          LABEL_GAP_PX * Math.max(0, parts.length - 1);
        max = Math.max(max, w);
      }
      if (max > 0)
        el.style.setProperty("--ccy-w", `${Math.ceil(max) + CHROME_PX}px`);
    };
    fit();
    // Attributes are not observed: setting --ccy-w must not re-trigger this.
    const mo = new MutationObserver(fit);
    mo.observe(el, { subtree: true, childList: true, characterData: true });
    void document.fonts?.ready.then(fit);
    return () => mo.disconnect();
  });
}
