"use client";
/**
 * NavCacheWarmer — proactively warms the service worker's nav-doc cache while
 * online so an offline reload (or a cold PWA open) serves the REAL cached page
 * instead of the offline-shell (260615-e8s round 4).
 *
 * Why it's needed: the SW only caches a route on a hard navigation it controls.
 * But the PWA start_url is "/" — a 307 → /<locale> redirect that can't be cached
 * — and routes reached by client-side soft-nav never produce a cacheable
 * navigation. So the nav cache is frequently empty and a cold offline open falls
 * to the bare offline-shell. On every navigation (while online + controlled) we
 * post the home route + the current path to the SW, which fetches and caches the
 * real documents (see sw.ts `WARM_ROUTES`).
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function NavCacheWarmer({ locale }: { locale: string }) {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (!navigator.onLine) return;
    const home = `/${locale}`;
    const urls = Array.from(new Set([home, pathname].filter(Boolean)));
    navigator.serviceWorker.ready
      .then((reg) => {
        const sw = navigator.serviceWorker.controller ?? reg.active;
        sw?.postMessage({ type: "WARM_ROUTES", urls });
      })
      .catch(() => {
        // SW not ready / unsupported — non-fatal.
      });
  }, [pathname, locale]);

  return null;
}
