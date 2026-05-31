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
import { NetworkOnly, CacheFirst, NetworkFirst, Serwist } from "serwist";

const OFFLINE_FALLBACK_URL = "/en/server-down";

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
    // Static assets (JS, CSS, images) — cache first
    {
      matcher: ({ request }: { request: Request }) =>
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "image",
      handler: new CacheFirst({
        cacheName: "static-assets",
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
