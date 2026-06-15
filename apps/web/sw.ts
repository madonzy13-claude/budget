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
 * Offline navigation strategy (app-shell offline nav, 260614-rwt): a navigation
 * is network-first WITH WRITE — a successful 2xx navigation is written to the
 * NAV_CACHE so the route replays offline. If the origin is unreachable
 * (throw / 5xx) we return the CACHED navigation document for that route so
 * previously-VISITED routes render the REAL page (header + chrome). On a cache
 * MISS we return the PRECACHED static app-shell document
 * (/offline-shell.html — real header chrome + an in-app "wasn't preloaded" note),
 * NOT a bare centered full-page takeover. 3xx/4xx pass through UNCACHED so
 * server-side auth redirects + 404s stay correct. The pure strategy lives in
 * ./sw-offline.ts (unit-tested without a real ServiceWorkerGlobalScope).
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
  Serwist,
} from "serwist";
import { handleNavigationRequest } from "./sw-offline";

// Bump this suffix whenever the static-asset caching strategy changes so a new
// service worker abandons the old runtime cache instead of inheriting a stuck
// one. The activate handler below deletes every static-asset cache that is not
// the current generation, which unsticks clients that pinned a stale CSS/JS
// bundle under a prior strategy.
const STYLE_CACHE = "static-styles-v2";
const SCRIPT_IMAGE_CACHE = "static-assets-v2";
// NetworkFirst-with-write cache for navigation documents (real pages) so a
// previously-VISITED route renders offline. Bump the suffix if the nav strategy
// changes so a new worker abandons the old nav docs. Listed in
// CURRENT_STATIC_CACHES so the activate purge KEEPS it.
const NAV_CACHE = "nav-docs-v1";
// Static app-shell document served on an offline nav cache MISS (real header
// chrome + in-app "wasn't preloaded" note). Auto-precached by @serwist/next from
// public/** → retrievable via caches.match / serwist.matchPrecache.
const OFFLINE_SHELL_URL = "/offline-shell.html";
const CURRENT_STATIC_CACHES = new Set([
  STYLE_CACHE,
  SCRIPT_IMAGE_CACHE,
  NAV_CACHE,
]);
// Legacy/superseded runtime cache names to purge on activate.
const LEGACY_STATIC_CACHES = ["static-assets", "static-styles"];

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: any;

// Explicit type annotation breaks the self-referential inference cycle: the
// navigation handler below calls serwist.matchPrecache (the precached app-shell
// fallback), so without an annotation TS7022 fires (`serwist` referenced in its
// own initializer). The handler only runs at request time, after assignment.
const serwist: Serwist = new Serwist({
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
    // Next.js page navigations — network-first WITH WRITE → CACHED real page →
    // precached app-shell (app-shell offline nav, 260614-rwt).
    //
    // Try the network; a successful 2xx is written to NAV_CACHE so the route
    // replays offline. On throw / 5xx we return the CACHED navigation document
    // for THIS route (ignoreSearch) so a previously-visited route renders the
    // REAL page offline. On a cache MISS we serve the precached app-shell
    // (/offline-shell.html — header chrome + in-app note), NOT a bare full-page
    // takeover. 3xx/4xx pass through UNCACHED so server-side auth redirects +
    // 404s stay correct.
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: ({ request }: { request: Request }) =>
        handleNavigationRequest(
          request,
          (req) => fetch(req),
          (req) => caches.match(req, { ignoreSearch: true }),
          (req, res) => caches.open(NAV_CACHE).then((c) => c.put(req, res)),
          () =>
            caches
              .match(OFFLINE_SHELL_URL)
              .then((hit) => hit ?? serwist.matchPrecache(OFFLINE_SHELL_URL)),
        ),
    },
  ],
});

serwist.addEventListeners();

// Proactive nav-cache warming (260615-e8s round 4). The SW only caches a route
// on a hard navigation it controls — but the PWA start_url "/" is a 307 redirect
// (uncacheable), and client-side soft-nav never produces a cacheable navigation,
// so the nav cache is often empty and a cold offline open falls to the
// offline-shell. The client posts the routes it wants available offline (home +
// current path, see nav-cache-warmer.tsx); we fetch the REAL 2xx documents and
// store them in NAV_CACHE so an offline reload serves the real page. A redirected
// response is skipped — it can never satisfy a navigation.
self.addEventListener("message", (event: any) => {
  const data = event.data;
  if (!data || data.type !== "WARM_ROUTES" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(NAV_CACHE);
      await Promise.all(
        data.urls.map(async (u: string) => {
          if (typeof u !== "string" || !u.startsWith("/")) return;
          try {
            const res = await fetch(u, { credentials: "include" });
            if (res.ok && !res.redirected) {
              await cache.put(new Request(u), res.clone());
            }
          } catch {
            /* offline / fetch error — skip */
          }
        }),
      );
    })(),
  );
});

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
      const match = clients.find(
        (c: { url: string }) => c.url.endsWith(url) || c.url.includes(url),
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
