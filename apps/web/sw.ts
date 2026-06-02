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
 * Offline navigation fallback: when a navigation request times out AND no
 * cached entry exists, we serve the precached /en/server-down page instead
 * of the browser's default offline screen. On iOS standalone-mode PWAs the
 * default screen renders as a blank dark viewport — users reported it as a
 * "black screen". The fallback runs entirely from the precache, so it works
 * even with no network and no API container.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  NetworkOnly,
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
  Serwist,
} from "serwist";

const OFFLINE_FALLBACK_URL = "/en/server-down";

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
    // Next.js pages — NetworkFirst.
    // T-9-extension: StaleWhileRevalidate served stale authenticated HTML across
    // sign-in/sign-out boundaries (e.g. signed-out user could navigate to a
    // previously-visited /workspaces and still see the cached page bypassing
    // middleware). NetworkFirst forces every navigation to hit the server first
    // (so middleware runs and middleware-driven redirects work), with the
    // cache as an offline fallback only.
    //
    // handlerDidError plugin: NetworkFirst already falls back to the runtime
    // cache when the network attempt times out. When the runtime cache is
    // ALSO empty (first-time visitor while offline, or this URL was never
    // visited) handlerDidError fires and we return the precached
    // /en/server-down page. Without this hook the browser falls through to
    // its own default offline UI — which on iOS standalone PWAs is the
    // blank-black-viewport "black screen" we are fixing.
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 5,
        plugins: [
          {
            handlerDidError: async () => {
              const cached = await caches.match(OFFLINE_FALLBACK_URL, {
                ignoreSearch: true,
              });
              return (
                cached ??
                new Response(
                  "<!DOCTYPE html><meta charset=utf-8><title>Budget</title><body style='margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#181a20;color:#eaecef;font-family:system-ui;text-align:center;padding:24px'><div><h1 style='font-size:20px;margin:0 0 8px'>We can't reach the server</h1><p style='font-size:14px;color:#848e9c'>Try again in a moment.</p></div></body>",
                  {
                    status: 503,
                    headers: { "content-type": "text/html; charset=utf-8" },
                  },
                )
              );
            },
          },
        ],
      }),
    },
  ],
});

serwist.addEventListeners();

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
