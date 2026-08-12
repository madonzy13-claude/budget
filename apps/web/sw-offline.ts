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
 * Routes whose HTML carries server-rendered USER DATA, so a cached copy can be
 * wrong rather than merely old.
 *
 * Cache-first (below) is sound only for the data-free client shells the SPA/SWR
 * refactor produced: the document holds no numbers, React Query fills them and
 * revalidates. /settings is the exception — a server component reads the session
 * and renders the display currency, timezone and profile straight into the
 * document. Served from cache, a reload right after changing the display
 * currency painted the OLD value, and no refetch could fix it because the value
 * never came from a query (260812).
 *
 * The first path segment is the locale, so anchor there: this must NOT catch a
 * budget's own /settings tab, which is a client-data pane and belongs on the
 * fast path.
 */
const SERVER_DATA_ROUTE = /^\/[^/]+\/settings(?:\/|$)/;

export function servesServerRenderedData(url: string): boolean {
  try {
    return SERVER_DATA_ROUTE.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Navigation strategy: network-first WITH WRITE, fall back to the cached real
 * document, then to the precached app-shell.
 *
 * A route we already hold is served from cache at once (see below); otherwise
 * we go to the network.
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
  isOffline = false,
): Promise<Response> {
  // CACHE-FIRST for a route we already hold (260806 user request: "all pages
  // render from cache instantly, no matter if the internet is good, bad or
  // off"). The old strategy raced the network against a timeout BEFORE looking
  // in the cache, and skipped that wait only when navigator.onLine was false —
  // so a genuinely offline device was fast and a barely-connected one blanked
  // for the full three seconds. Exactly backwards, and the case the user hit.
  //
  // Serving the stored document costs nothing we would otherwise have: the nav
  // doc is a DATA-FREE client shell (SPA/SWR refactor), so it carries no stale
  // numbers — React Query fills the rows from its own persisted cache and
  // revalidates. What we give up is a fresh SHELL on the first paint, which
  // arrives a moment later anyway via the background refresh below and is
  // picked up on the next load.
  //
  // …except where the document is NOT data-free (see SERVER_DATA_ROUTE): there
  // the cached copy can be stale-and-wrong, so we go to the network and keep the
  // cache purely as the offline fallback further down.
  const cachedFirst = servesServerRenderedData(request.url)
    ? undefined
    : await matchCache(request);
  if (cachedFirst) {
    // Revalidate behind the paint. Deliberately NOT awaited: the whole point is
    // that the response is already on its way back to the browser. Skipped when
    // the device reports offline — navigator.onLine can lie TRUE but never
    // FALSE, so there is genuinely nothing to fetch.
    if (isOffline) return cachedFirst;
    void (async () => {
      try {
        const fresh = await fetchFn(request);
        // Only a real 2xx replaces it. A 4xx/5xx or a thrown fetch must never
        // evict a good page — that would turn one bad moment into a route that
        // no longer works offline.
        if (fresh.status >= 200 && fresh.status < 300) {
          await cachePut(request, fresh.clone());
        }
      } catch {
        /* offline / slow / DNS — keep what we have */
      }
    })();
    return cachedFirst;
  }

  // No cached copy — this route has never been visited, so there is nothing to
  // paint and we must go to the network. Offline that fetch rejects at once and
  // we fall through to the app-shell below.
  // Kick off the REAL network navigation. CRITICAL (260625): do NOT abort it on
  // the timeout. A healthy ONLINE navigation that merely needs longer than
  // `timeoutMs` — e.g. the browser's per-host connection pool is briefly
  // saturated by a burst of background data prefetches — must NEVER be killed
  // and shown the offline app-shell while the device is online.
  const network: Promise<{ res: Response } | { err: unknown }> = fetchFn(
    request,
  ).then(
    (res) => ({ res }),
    (err) => ({ err }),
  );

  const settled = await network;

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
