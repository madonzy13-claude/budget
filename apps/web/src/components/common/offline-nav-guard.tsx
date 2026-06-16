"use client";
/**
 * OfflineNavGuard — keeps offline in-app navigation FAST.
 *
 * Background (260615-e8s round 7): Next App Router soft-nav fetches an RSC
 * payload. On a real offline device that fetch HANGS (never rejects), so a
 * soft-nav to a route whose RSC isn't cached sits forever with no recovery. The
 * original guard "solved" this by forcing a full `location.assign` hard
 * navigation for EVERY offline link click → the SW serves the cached document.
 *
 * But a hard navigation is expensive: it reloads the document AND re-parses every
 * JS chunk, re-hydrates, and re-runs the client boot — ~1s+ even when every byte
 * is served from the SW cache. The user (260616) correctly flagged that nothing
 * should block rendering an already-cached page.
 *
 * SPA/SWR fix (quick-260616-spa): with `experimental.staleTimes.dynamic` now set
 * (next.config.mjs), the client Router Cache RETAINS visited route shells, so an
 * offline soft-nav to a recently-visited route commits from cache with NO RSC
 * fetch — instant, no hang, no reload. So this guard now:
 *   1. Online → does nothing (native fast SPA soft-nav).
 *   2. Offline → lets the soft-nav PROCEED (no preventDefault) and starts a
 *      watchdog. If the soft-nav commits (URL becomes the target) within the
 *      grace window — the route was router-cached — we're done: instant SPA nav,
 *      no reload. If it does NOT commit in time — the route's RSC wasn't cached
 *      and the fetch is hanging — we fall back to `location.assign` so the SW's
 *      document handler serves the cached page (or the offline shell).
 *
 * Net: offline navigation to any route visited recently is now as fast as online
 * (no full reload); only genuinely-uncached offline routes pay the hard-nav cost.
 */
import { useEffect } from "react";

// Grace window for a soft-nav to commit from the Router Cache before we assume
// it's hanging on an uncached-route RSC fetch and force a hard navigation. A
// cached-route commit is ~80-150ms; 500ms is comfortably above that yet still a
// snappy fallback for the uncached case.
const SOFT_NAV_GRACE_MS = 500;

export function OfflineNavGuard() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Only act when genuinely offline; online keeps the fast SPA soft-nav.
      if (typeof navigator === "undefined" || navigator.onLine !== false)
        return;
      // Respect default-prevented, non-primary, and modifier/new-tab clicks.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      // Same-origin app links only; skip new-tab / download / hash-only links.
      if (!href || !href.startsWith("/")) return;
      const t = a.getAttribute("target");
      if (t && t !== "_self") return;
      if (a.hasAttribute("download")) return;

      // Let Next attempt the soft-nav (do NOT preventDefault). Watch for the
      // URL to commit to the target path; if it doesn't within the grace window
      // the RSC fetch is hanging (route not in the Router Cache) → hard-nav to
      // the SW-served document instead.
      let targetPath: string;
      try {
        targetPath = new URL(href, window.location.origin).pathname;
      } catch {
        return;
      }
      // Same-path (query/hash only) change → soft-nav handles it; no watchdog.
      if (targetPath === window.location.pathname) return;

      const start = performance.now();
      let settled = false;
      function check() {
        if (settled) return;
        if (window.location.pathname === targetPath) {
          settled = true; // soft-nav committed from cache — instant, no reload.
          return;
        }
        if (performance.now() - start > SOFT_NAV_GRACE_MS) {
          settled = true;
          window.location.assign(href!); // hanging RSC → SW document fallback.
          return;
        }
        requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    }
    document.addEventListener("click", onClick, true); // capture phase
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
