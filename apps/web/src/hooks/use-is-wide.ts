"use client";
/**
 * use-is-wide.ts — true once the viewport is at least `minPx` wide (default the
 * Tailwind `md` breakpoint, 768px). SSR-safe: starts false, resolves on mount.
 *
 * Mirrors the inline matchMedia pattern used across the wallets tab
 * (investment-row, investment-group-header) — extracted so the wallet + possession
 * currency pickers can share one "enough width for the full currency name" gate.
 */
import { useEffect, useState } from "react";

export function useIsWide(minPx = 768): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minPx}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [minPx]);
  return wide;
}
