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
// v2 (SPA/SWR refactor 260616): the spendings/wallets/reserves/settings tab
// DOCS changed shape (SSR-with-baked-data → data-free client shells). A device
// holding pre-refactor v1 docs would serve a stale document offline that
// mismatches the new client chunks → blank/black tab pages. Bumping the suffix
// makes the new worker's activate-purge drop the v1 docs and re-warm fresh ones.
const NAV_CACHE = "nav-docs-v2";
// NetworkFirst-with-write cache for Next App Router RSC payloads (the soft-nav
// flight responses, `RSC: 1` header). Caching these lets client-side navigation
// to a previously-visited OR prefetched route work offline (Next prefetches
// in-viewport links — the BDP pills + home budget cards — so they self-populate).
// NetworkFirst keeps online fresh; offline serves the cached RSC. Bump the suffix
// to abandon a stale generation; the activate purge deletes non-current rsc-*.
// v2: dropped the hand-warmed RSC entries (a bare `RSC: 1` warm fetch produced
// broken redirect payloads); only genuine prefetch/nav RSC is cached now.
// v3 (SPA/SWR refactor 260616): the tab pages became data-free client shells, so
// a pre-refactor RSC payload renders stale offline — bump to purge + re-warm.
const RSC_CACHE = "rsc-v3";
// Static app-shell document served on an offline nav cache MISS (real header
// chrome + in-app "wasn't preloaded" note). Auto-precached by @serwist/next from
// public/** → retrievable via caches.match / serwist.matchPrecache.
const OFFLINE_SHELL_URL = "/offline-shell.html";
const CURRENT_STATIC_CACHES = new Set([
  STYLE_CACHE,
  SCRIPT_IMAGE_CACHE,
  NAV_CACHE,
  RSC_CACHE,
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
    // Next App Router RSC payloads (soft-nav flight responses, `RSC: 1` header) —
    // NetworkFirst-with-write so CLIENT-SIDE navigation to a previously-visited
    // OR prefetched route works offline (Next prefetches in-viewport links — the
    // BDP pills + home budget cards — so they self-populate). NetworkFirst keeps
    // online fresh; offline serves the cached RSC. The cache key strips the
    // `_rsc` cache-buster query so an offline request (different/absent `_rsc`)
    // still matches the stored payload. Never matches /api (that rule is first).
    {
      matcher: ({ request, url }: { request: Request; url: URL }) =>
        url.origin === self.location.origin &&
        request.headers.get("RSC") === "1",
      handler: new StaleWhileRevalidate({
        cacheName: RSC_CACHE,
        // StaleWhileRevalidate (cache-first) so a soft-nav commits INSTANTLY from
        // cache (offline AND online) and revalidates in the background — that is
        // why offline navigation is blazing fast.
        //
        // 260619 CRITICAL: a Next App Router RSC response VARIES by the
        // `next-router-state-tree` (+ `next-url`) request header — it is the flight
        // payload for "render route Y given the router is currently at tree X". The
        // OLD cache key was URL-only (just stripped `_rsc`), so when the SW was
        // controlling the page the first soft-nav got back the RSC for a DIFFERENT
        // tree → Next could not reconcile it and BAILED TO A FULL HARD NAVIGATION
        // (the slow ~700ms "first pill online, later fast" — offline was fast only
        // because that path warmed the matching tree). Folding the tree + next-url
        // into the cache key means a wrong-tree entry simply MISSES (→ background
        // network fetch returns the correct payload → clean soft-nav) instead of
        // being served and forcing a hard reload. Same-source prefetch + nav share
        // a tree → hit → instant. rsc-v3 + activate-purge still version the cache.
        plugins: [
          {
            cacheKeyWillBeUsed: async ({
              request,
            }: {
              request: Request;
            }): Promise<Request> => {
              const u = new URL(request.url);
              u.searchParams.delete("_rsc");
              const tree = request.headers.get("next-router-state-tree");
              const nextUrl = request.headers.get("next-url");
              if (tree) u.searchParams.set("__rsctree", tree);
              if (nextUrl) u.searchParams.set("__rscnurl", nextUrl);
              return new Request(u.toString(), { headers: { RSC: "1" } });
            },
          },
        ],
      }),
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
          3_000,
          // Offline fast-path: skip the dead-network timeout, serve cache now.
          typeof navigator !== "undefined" && navigator.onLine === false,
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
      const navCache = await caches.open(NAV_CACHE);
      await Promise.all(
        data.urls.map(async (u: string) => {
          if (typeof u !== "string" || !u.startsWith("/")) return;
          // Warm the DOCUMENT only (hard-nav / reload fallback). We deliberately
          // do NOT hand-fetch the RSC payload: a bare `RSC: 1` request without
          // Next's `Next-Router-State-Tree`/`Next-Url` headers returns a DIFFERENT
          // (often redirect) payload than a real soft-nav, which cached as a
          // broken "go to sign-in" RSC. Real RSC is cached by the runtime rule
          // from Next's genuine prefetch/nav requests; an offline soft-nav to a
          // doc-warmed-but-RSC-uncached route falls back to a hard navigation,
          // which the SW serves from this warmed document.
          try {
            const res = await fetch(u, { credentials: "include" });
            if (res.ok && !res.redirected) {
              await navCache.put(new Request(u), res.clone());
            }
          } catch {
            /* offline / error — skip */
          }
        }),
      );
    })(),
  );
});

// push — display the incoming notification (PWAX-04/05). WITHOUT this handler the
// browser receives the push but shows NOTHING (Test 8 "no notification arrived",
// 260618). The payload is JSON.stringify({ title, body, url }) from the worker
// (push-notification-handler.ts). We surface title+body (D-15: no amounts) and
// stash `url` in notification.data so the notificationclick handler below can
// deep-link. `userVisibleOnly` subscriptions REQUIRE a visible notification per
// push — failing to show one is penalised by the browser.
self.addEventListener("push", (event: any) => {
  let payload: { title?: string; body?: string; url?: string } = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title ?? "Budget";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: "/icons/icon-192-any.png",
      badge: "/icons/icon-192-any.png",
      data: { url: payload.url ?? "/" },
      tag: payload.url ?? "budget-task",
    }),
  );
});

// notificationclick — deep-link handler (D-13 / PWAX-06)
// The url is set server-side by the push-notification-handler to
// /<locale>/budgets/<id>/<tab>?task=<taskId> (T-08-05-02: constructed from a
// fixed template + registry tab, never from arbitrary notification payload).
//
// 260618 (round 3): on a standalone iOS PWA, NONE of the SW navigation APIs
// route the open window — `clients.matchAll()` is frequently EMPTY (the PWA
// window isn't a reported client), and `WindowClient.navigate()` /
// `clients.openWindow()` only REFOCUS the existing window without changing the
// route. navigate() AND postMessage both fell through to openWindow → the user
// stayed on the budget list. The reliable channel is to PERSIST the target URL
// to a Cache; the page (SwDeepLinkNav) reads + clears it on the next foreground
// transition — which always fires when the tap brings the PWA forward. We still
// fire the best-effort focus/postMessage/openWindow paths for Android/desktop
// and cold start.
const DEEPLINK_CACHE = "budget-deeplink";
const DEEPLINK_KEY = "/__pending_deeplink__";

self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/";
  event.waitUntil(
    (async () => {
      // Primary channel (works on iOS): persist the pending deep-link so the
      // foregrounded page can consume it. Write BEFORE focusing so it is present
      // by the time visibilitychange/focus fires in the page.
      try {
        const cache = await caches.open(DEEPLINK_CACHE);
        await cache.put(DEEPLINK_KEY, new Response(url));
      } catch {
        // cache unavailable — fall back to the live paths below
      }

      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Best-effort live paths (Android/desktop): focus the window + ping it so
      // SwDeepLinkNav consumes the pending URL immediately, without waiting for a
      // visibility change. iOS typically has no client here → openWindow.
      for (const client of clients) {
        const c = client as {
          url: string;
          focus?: () => Promise<unknown>;
          postMessage?: (msg: unknown) => void;
        };
        try {
          if (typeof c.postMessage === "function") {
            c.postMessage({ type: "DEEP_LINK", url });
          }
          if (typeof c.focus === "function") await c.focus();
          return;
        } catch {
          // try the next client, else openWindow
        }
      }
      await self.clients.openWindow(url);
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
                key.startsWith("static-assets") ||
                key.startsWith("rsc-") ||
                // nav-docs-* MUST be purged when superseded: the nav handler's
                // caches.match(ignoreSearch) searches ALL caches, so a leftover
                // stale generation (e.g. pre-SPA-refactor nav-docs-v1) would be
                // served offline → blank/black tab pages (260616 bug).
                key.startsWith("nav-docs-")) &&
                !CURRENT_STATIC_CACHES.has(key)),
          )
          .map((key: string) => caches.delete(key)),
      );
    })(),
  );
});
