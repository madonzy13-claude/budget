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
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, CacheFirst, NetworkFirst, Serwist } from "serwist";

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
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 5,
      }),
    },
  ],
});

serwist.addEventListeners();
