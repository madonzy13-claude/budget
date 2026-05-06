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
import {
  NetworkOnly,
  CacheFirst,
  StaleWhileRevalidate,
  Serwist,
} from "serwist";

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
    // Next.js pages — stale while revalidate
    {
      matcher: ({ request }: { request: Request }) =>
        request.mode === "navigate",
      handler: new StaleWhileRevalidate({
        cacheName: "pages",
      }),
    },
  ],
});

serwist.addEventListeners();
