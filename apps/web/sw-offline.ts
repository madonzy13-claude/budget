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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let unreachable = false;
  try {
    const res = await fetchFn(
      new Request(request, { signal: controller.signal }),
    );
    // 5xx → server reachable but failing; treat as unreachable for navigation so
    // we render the last-known-good cached/app-shell doc instead of an error body.
    if (res.status >= 500) {
      unreachable = true;
    } else {
      // NetworkFirst WRITE: only cache real successful navigations (2xx). Never
      // cache 3xx redirects or 4xx so server-side auth redirects + 404s stay
      // correct and are not replayed stale offline.
      if (res.status >= 200 && res.status < 300) {
        await cachePut(request, res.clone());
      }
      return res;
    }
  } catch {
    unreachable = true;
  } finally {
    clearTimeout(timer);
  }

  if (unreachable) {
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
  // Unreachable in practice — kept for exhaustiveness.
  const shell = await matchShell();
  return shell ?? new Response(null, { status: 503 });
}
