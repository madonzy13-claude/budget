"use client";
/**
 * use-is-standalone.ts — true only in the installed PWA (standalone display mode).
 *
 * Consolidates the display-mode check that was duplicated inline across the shell
 * (install-banner, safe-area-top-sync, pull-to-refresh, …). SSR-safe: returns
 * false until mounted, so anything gated on it is hidden on the server + first
 * paint (no hydration mismatch) and only appears once we confirm standalone.
 */
import { useEffect, useState } from "react";

export function isStandaloneNow(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const sync = () => setStandalone(isStandaloneNow());
    sync();
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return standalone;
}
