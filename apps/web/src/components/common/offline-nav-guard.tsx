"use client";
/**
 * OfflineNavGuard — forces a real DOCUMENT navigation for in-app links WHILE
 * OFFLINE.
 *
 * Next App Router soft-nav fetches an RSC payload. Offline that fetch HANGS, and
 * App Router updates the URL OPTIMISTICALLY (pushState) the instant the Link is
 * clicked — so the address bar shows the target while the RSC never arrives and,
 * with the per-tab loading.tsx files removed, the screen is left BLANK with no
 * recovery. Worse, a soft-nav is not a document request, so the service worker
 * never gets a chance to answer with the cached page or the offline shell — the
 * user is stuck on a black screen (260616/260617 device reports).
 *
 * So when `navigator.onLine === false` (reliable on a real offline device) we
 * intercept same-origin link clicks and do a real `window.location.assign`. That
 * goes through the SW navigation handler, which (cache-first when offline) serves
 * the cached document for a previously-visited route, or the offline-shell on a
 * cache miss — never a blank screen. Online we do nothing and keep Next's fast
 * client-side soft-nav.
 *
 * NOTE: an earlier revision tried to KEEP the soft-nav and only hard-navigate via
 * a watchdog when it "didn't commit". That was broken — App Router's optimistic
 * URL update made the watchdog's `location.pathname === target` check a false
 * positive, so it never fell back and the page hung blank. Hence: always hard-nav
 * offline. Offline navigation costs a document reload (~1s) but is RELIABLE.
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
      // Force a real navigation → SW document handler → cached page / offline shell.
      e.preventDefault();
      window.location.assign(href);
    }
    document.addEventListener("click", onClick, true); // capture phase
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
