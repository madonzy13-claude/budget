/**
 * sw-offline.ts — pure, side-effect-free navigation strategy for the Serwist
 * service worker (sw.ts). Kept separate so it can be unit-tested
 * (test/sw-offline.test.ts) WITHOUT executing the service-worker bootstrap
 * (`new Serwist(...)` + `addEventListeners()`), which requires a real
 * ServiceWorkerGlobalScope and crashes under happy-dom.
 *
 * App-shell offline nav (260614-rwt): the OLD q1v strategy READ the nav cache
 * but NEVER WROTE to it, so the cache was almost always empty and offline nav
 * fell through to a BARE centered full-page 503 takeover. The NEW strategy is
 * "the app shell is always present":
 *   1. Try the network.
 *   2. A successful real navigation (2xx) → WRITE it to the nav cache (so the
 *      route can be replayed offline) and return it.
 *   3. 3xx/4xx (<500) → return unchanged, do NOT cache (auth redirects stay safe).
 *   4. throw OR 5xx → unreachable:
 *        - cache HIT  → return the cached REAL document (header + chrome render;
 *          row data fills from the IndexedDB read cache or shows the empty state).
 *        - cache MISS → return the PRECACHED static APP-SHELL document (real
 *          header chrome + an in-app "wasn't preloaded" note) — NOT a bare
 *          centered full-page takeover.
 *        - shell MISS too → a minimal last-resort 503 (never undefined).
 *
 * Playwright's `context.setOffline()` does NOT make the SW's own fetch reject, so
 * these injected-fake unit tests are the deterministic regression guard.
 */

export const SUPPORTED_LOCALES = ["en", "pl", "uk"] as const;

/**
 * Navigation strategy: network-first WITH WRITE, fall back to the cached real
 * document, then to the precached app-shell.
 *
 * Try the network with a timeout.
 *   - A real 2xx is cached (cachePut) before returning so the route replays
 *     offline. 3xx/4xx pass through uncached (auth redirects, 404s stay correct).
 *   - A 5xx (server up but erroring) or a thrown fetch (offline / DNS / connect-
 *     refused / abort) is treated as unreachable: return the cached navigation
 *     document for this request if one exists (header + chrome); otherwise return
 *     the precached app-shell document; if even that misses, a minimal 503.
 */
export async function handleNavigationRequest(
  request: Request,
  fetchFn: (req: Request) => Promise<Response>,
  matchCache: (req: Request) => Promise<Response | undefined>,
  cachePut: (req: Request, res: Response) => Promise<void> | void,
  matchShell: () => Promise<Response | undefined>,
  timeoutMs = 3_000,
  isOffline = false,
): Promise<Response> {
  // Offline fast-path (quick-260616-spa). When the device reports offline the
  // network fetch only HANGS until the abort timeout fires — so every cached-
  // page navigation waited the full timeout (the user-reported ~5-6s lag)
  // BEFORE checking the cache, even though the real document was sitting there.
  // Serve the cached document immediately instead — that is the entire point of
  // the nav cache. navigator.onLine can lie TRUE on iOS (then isOffline is
  // false and we take the timeout-bounded network path below), but it never
  // lies FALSE, so reading the cache first when it reports offline is a strict
  // win with no freshness cost (offline = nothing fresher to fetch anyway). On
  // a cache MISS we fall through to the network/shell path below.
  if (isOffline) {
    const cached = await matchCache(request);
    if (cached) return cached;
  }

  // Kick off the REAL network navigation. CRITICAL (260625): do NOT abort it on
  // the timeout. A healthy ONLINE navigation that merely needs longer than
  // `timeoutMs` — e.g. the browser's per-host connection pool is briefly
  // saturated by a burst of background data prefetches (the BDP past-month
  // spendings-summary prefetch fires ~14 requests at once) — must NEVER be
  // killed and shown the offline app-shell while the device is online. The old
  // code aborted the fetch at 3s → the abort threw → "unreachable" → the
  // precached offline-shell was served for a perfectly reachable route. That
  // produced a spurious "This page isn't available offline" page under load (a
  // real user-facing bug AND the reserves-golden walk's wallet-row flake: the
  // /wallets nav doc returned 200 at ~3010ms, just past the 3s timeout). The
  // timeout now only RACES a cached fallback; the network request itself runs to
  // completion and its result is always honored.
  const network: Promise<{ res: Response } | { err: unknown }> = fetchFn(
    request,
  ).then(
    (res) => ({ res }),
    (err) => ({ err }),
  );
  const timeout: Promise<"timeout"> = new Promise((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs),
  );

  // If the network is slower than the timeout, serve a cached document for this
  // route WHEN ONE EXISTS (the nav doc is a data-free client shell, so a cache
  // hit paints fast and carries no stale data — RQ rehydrates the rows). With NO
  // cache we keep waiting for the real network response below rather than falsely
  // declaring the app offline while it is online.
  const raced = await Promise.race([network, timeout]);
  if (raced === "timeout") {
    const cached = await matchCache(request);
    if (cached) return cached;
  }

  const settled = raced === "timeout" ? await network : raced;

  if ("res" in settled) {
    const res = settled.res;
    // 5xx → server reachable but failing; treat as unreachable for navigation so
    // we render the last-known-good cached/app-shell doc instead of an error body.
    if (res.status < 500) {
      // NetworkFirst WRITE: only cache real successful navigations (2xx). Never
      // cache 3xx redirects or 4xx so server-side auth redirects + 404s stay
      // correct and are not replayed stale offline.
      if (res.status >= 200 && res.status < 300) {
        await cachePut(request, res.clone());
      }
      return res;
    }
  }

  // Thrown fetch (offline / DNS / connect-refused) OR a 5xx → unreachable: serve
  // the cached real document for this route, else the precached app-shell, else a
  // minimal last-resort 503 (never undefined).
  const cached = await matchCache(request);
  if (cached) return cached;
  const shell = await matchShell();
  if (shell) return shell;
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Budget</title>" +
      "<body>Offline. Reconnect to continue.</body>",
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "5",
      },
    },
  );
}
