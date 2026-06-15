"use client";
/**
 * OfflineNavGuard — forces a full-page navigation for in-app links WHILE OFFLINE
 * (260615-e8s round 7).
 *
 * Why: Next App Router client-side (soft) navigation fetches an RSC payload. On a
 * real offline device that fetch HANGS (it does not reject), so Next sits on the
 * route's loading.tsx Suspense fallback forever — verified: a hanging RSC leaves
 * the page on skeletons even after 16s, with no recovery. The service worker
 * cannot force Next to abandon a pending soft-nav.
 *
 * So when navigator.onLine === false (reliable on iOS), we intercept clicks on
 * same-origin links and do a real `location.assign` instead. A full navigation
 * goes through the SW's navigation handler, which has its own 5s timeout and
 * serves the cached document — rendering the real page (with data for routes
 * visited/warmed online), then the per-entity hooks' offline fast-path fills any
 * client data from IndexedDB. Online, we do nothing and let Next soft-nav.
 */
import { useEffect } from "react";

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
      // Force a real navigation → SW document handler → cached page.
      e.preventDefault();
      window.location.assign(href);
    }
    document.addEventListener("click", onClick, true); // capture phase
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
