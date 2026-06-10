/**
 * Serwist service worker for Budget PWA.
 *
 * T-9 Security mitigation: runtimeCaching MUST exclude /api/* and authenticated HTML.
 * Reason: Without this denylist, tenant-A's cached API responses or authenticated
 * pages could be served to tenant-B session when both sessions share the same
 * browser profile. This is an information disclosure vulnerability.
 *
 * Plan 10 PC-10 adds an end-to-end Playwright assertion verifying this isolation.
 *
 * Explicit /api/ route exclusions (NetworkOnly — never cached):
 * - /api/auth/*  (authentication routes)
 * - /api/workspaces/*  (workspace data)
 * - /api/settings/*  (user settings)
 *
 * Offline navigation fallback: when a navigation request cannot reach the
 * origin we serve the precached /offline.html document instead of the browser's
 * default offline screen (a blank dark viewport on iOS standalone PWAs — the
 * "black screen") AND instead of a stale, redirect-prone app/sign-in shell.
 *
 * Why a STATIC /offline.html and not the /<locale>/server-down route (05-18):
 * /<locale>/server-down is a DYNAMIC Next.js route. @serwist/next only adds its
 * JS *chunk* to __SW_MANIFEST — never a navigable HTML document — so
 * caches.match("/en/server-down") always MISSED. NetworkFirst then fell back to
 * whatever HTML happened to sit in the runtime "pages" cache (often a previously
 * visited authenticated shell or /sign-in). That stale shell re-runs its
 * client-side auth/locale logic with no live server, bouncing sign-in <-> home
 * — the infinite offline redirect loop users reported. /offline.html lives in
 * public/, so the default globPublicPatterns precaches every public file: a HIT
 * is guaranteed offline, and the static doc never redirects.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
  Serwist,
} from "serwist";
import { buildOfflineDocument, handleNavigationRequest } from "./sw-offline";

// OFFLINE_FALLBACK_URL ("/offline.html") + the offline/navigation strategy live
// in ./sw-offline.ts (pure, unit-tested). See that module's header for the
// offline-redirect-loop rationale (05-18).

// Bump this suffix whenever the static-asset caching strategy changes so a new
// service worker abandons the old runtime cache instead of inheriting a stuck
// one. The activate handler below deletes every static-asset cache that is not
// the current generation, which unsticks clients that pinned a stale CSS/JS
// bundle under a prior strategy.
const STYLE_CACHE = "static-styles-v2";
const SCRIPT_IMAGE_CACHE = "static-assets-v2";
const CURRENT_STATIC_CACHES = new Set([STYLE_CACHE, SCRIPT_IMAGE_CACHE]);
// Legacy/superseded runtime cache names to purge on activate.
const LEGACY_STATIC_CACHES = ["static-assets", "static-styles"];

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

/**
 * Service-worker-bound wrapper: resolves the precached /offline.html via the
 * real Cache Storage and delegates to the pure builder in ./sw-offline.ts.
 */
async function offlineDocument(request: Request): Promise<Response> {
  return buildOfflineDocument(request, (url) =>
    caches.match(url, { ignoreSearch: true }),
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // T-9 DENYLIST: /api/* routes — NetworkOnly, NEVER cached
    // This prevents tenant-A cached responses from leaking to tenant-B session.
    // denylist pattern: /api/ — covers auth, workspaces, settings
    {
      matcher: ({ url }: { url: URL }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // Stylesheets — StaleWhileRevalidate. CSS carries the global cursor /
    // affordance rules; recurring UAT reports traced to a service worker
    // pinning a stale CSS bundle under CacheFirst, so a corrected build never
    // reached the user until they manually cleared storage. SWR serves the
    // cache instantly for speed but ALWAYS refetches in the background and
    // overwrites the cache, so the next paint is current — CSS can never pin.
    // (Next.js emits content-hashed, `immutable` CSS, so the background
    // revalidation only transfers bytes when the hash actually changed.)
    {
      matcher: ({ request }: { request: Request }) =>
        request.destination === "style",
      handler: new StaleWhileRevalidate({
        cacheName: STYLE_CACHE,
      }),
    },
    // Scripts + images — CacheFirst. These are content-hashed + `immutable`,
    // so a changed file always has a new URL (cache miss → fresh fetch); the
    // old URL is never referenced by fresh HTML. CacheFirst is safe and avoids
    // re-revalidating large, never-changing chunks on every load.
    {
      matcher: ({ request }: { request: Request }) =>
        request.destination === "script" || request.destination === "image",
      handler: new CacheFirst({
        cacheName: SCRIPT_IMAGE_CACHE,
      }),
    },
    // Next.js page navigations — network-only-then-OFFLINE-DOC.
    //
    // History (why this is no longer plain NetworkFirst):
    //   - StaleWhileRevalidate served stale authenticated HTML across
    //     sign-in/sign-out boundaries (T-9-extension) — fixed by NetworkFirst.
    //   - NetworkFirst then exposed the OFFLINE REDIRECT LOOP (05-18): when the
    //     network failed it fell back to whatever HTML sat in the "pages"
    //     runtime cache. For a navigation that had no exact cache entry,
    //     NetworkFirst returned a *previously cached different page* (commonly an
    //     authenticated app shell or /sign-in). That shell re-runs its
    //     client-side auth/locale logic with no live server and bounces
    //     sign-in <-> home forever.
    //
    // Fix: on a navigation we try the network; if it fails for ANY reason
    // (offline, timeout, 5xx) we serve the STATIC, non-redirecting
    // /offline.html document — never a stale page shell. A single failed
    // dependency therefore yields exactly ONE rendered offline screen and zero
    // redirects. The offline doc carries `?next=<path>&lang=<locale>` so its
    // Retry button returns the user to the page they wanted once the API is back
    // (and `online` auto-retries).
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: ({ request }: { request: Request }) =>
        handleNavigationRequest(request, (req) => fetch(req), offlineDocument),
    },
  ],
});

serwist.addEventListeners();

// notificationclick — deep-link handler (D-13 / PWAX-06)
// When the user taps a push notification, focus an existing window that matches
// the notification url, or open a new one. The url is set server-side by the
// push-notification-handler to /budgets/<id>/<tab>?task=<taskId> (T-08-05-02:
// url is constructed from a fixed template + registry tab, not from arbitrary
// notification payload data).
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      // Match any window controlled by this SW whose URL ends with our path
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const match = clients.find((c: { url: string }) =>
        c.url.endsWith(url) || c.url.includes(url),
      );
      if (match) {
        await (match as { focus: () => Promise<void> }).focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});

// Self-heal stuck clients: on activate, delete the legacy static-asset runtime
// caches (and any static cache that is not the current generation) so a worker
// that pinned a stale CSS/JS bundle starts from an empty cache and refetches.
// Runs alongside Serwist's own precache cleanup; only touches our named runtime
// caches — never the precache or the /api NetworkOnly path.
self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key: string) =>
              LEGACY_STATIC_CACHES.includes(key) ||
              ((key.startsWith("static-styles") ||
                key.startsWith("static-assets")) &&
                !CURRENT_STATIC_CACHES.has(key)),
          )
          .map((key: string) => caches.delete(key)),
      );
    })(),
  );
});
