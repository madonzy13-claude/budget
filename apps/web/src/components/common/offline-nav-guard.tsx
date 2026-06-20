"use client";
/**
 * OfflineNavGuard — offline navigation WATCHDOG. Lets the in-app link soft-nav
 * (so the PageTransition tab-slide animates exactly like online), and only falls
 * back to a hard document navigation if the soft-nav fails to commit.
 *
 * History: round 6/7's first offline soft-nav attempt black-screened on a
 * cold/evicted App Router cache (the RSC for the target tab wasn't cached → the
 * soft-nav landed on nothing). At the time tab pages had NO loading.tsx and tab
 * DATA wasn't persisted, so a miss = blank hang → we reverted to an unconditional
 * hard reload (reliable but un-animated).
 *
 * 260618: the ground has shifted enough to make offline soft-nav safe AND
 * animated, which the user explicitly wants ("offline animations must be the
 * same as online"):
 *   - every tab now has its own loading.tsx → a worst-case RSC miss shows a
 *     skeleton, never a black void;
 *   - budget-open warms ALL FOUR tabs' RSC (bdp-tabs router.prefetch) + DATA
 *     (usePrefetchBudgetTabs, persisted) + the SW caches RSC payloads
 *     (NetworkFirst-with-write) → offline soft-nav hits cache for any tab the
 *     user could have reached.
 *
 * So offline we now ALLOW the soft-nav (it animates) and arm a watchdog: if the
 * URL hasn't advanced to the target path within TIMEOUT — i.e. the soft-nav
 * never even committed (RSC fetch hung with nothing cached) — we hard-navigate
 * as the reliable fallback. The common warmed case animates; the rare cold-miss
 * still resolves to a real document the SW answers.
 *
 * Online: do nothing — native soft-nav already animates. Modifier / new-tab /
 * download / external links are ignored.
 */
import { useEffect } from "react";

// Soft-nav should commit (URL advance) well under this even offline-from-cache.
// If it hasn't, the RSC almost certainly isn't cached → hard-nav fallback.
const COMMIT_WATCHDOG_MS = 1200;

export function OfflineNavGuard() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Only act when genuinely offline; online keeps the native SPA soft-nav.
      if (typeof navigator === "undefined" || navigator.onLine !== false)
        return;
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
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      // Same-origin app links only; skip new-tab / download / external / hash.
      if (!href || !href.startsWith("/")) return;
      const t = a.getAttribute("target");
      if (t && t !== "_self") return;
      if (a.hasAttribute("download")) return;

      // DON'T preventDefault — let next/link soft-nav run so PageTransition's
      // tab-slide plays. Arm a watchdog: if the path never advances to the
      // target (soft-nav couldn't commit — nothing cached), hard-navigate.
      let targetPath: string;
      try {
        targetPath = new URL(href, window.location.origin).pathname;
      } catch {
        return;
      }
      // Already there (e.g. re-click active tab) → nothing to watch.
      if (window.location.pathname === targetPath) return;

      const start = Date.now();
      const iv = window.setInterval(() => {
        if (window.location.pathname === targetPath) {
          // Soft-nav committed → it's animating from cache. Done.
          window.clearInterval(iv);
        } else if (Date.now() - start > COMMIT_WATCHDOG_MS) {
          window.clearInterval(iv);
          // Never committed → reliable fallback document navigation.
          if (window.location.pathname !== targetPath) {
            window.location.assign(href);
          }
        }
      }, 100);
    }
    document.addEventListener("click", onClick, true); // capture phase
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
