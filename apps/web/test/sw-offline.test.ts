/**
 * Service-worker navigation strategy (app-shell offline nav, 260614-rwt).
 *
 * NEW contract (replaces the q1v "cached page → bare inline 503"):
 *   network-first WITH WRITE — a successful real navigation (2xx) is written to
 *   the nav cache via an injected cachePut, so the route can be replayed offline.
 *   On unreachable (throw / 5xx):
 *     - cache HIT  → return the cached REAL document (header + chrome present)
 *     - cache MISS → return the PRECACHED APP-SHELL document (header chrome + an
 *       in-app "wasn't preloaded" note), NOT a bare centered full-page takeover.
 *   3xx redirects + 4xx pass through unchanged and are NOT cached (auth-safe).
 *
 * The old `buildInlineOfflineNotice` full-page takeover is removed.
 *
 * These tests drive the pure handler with injected fetch/cache fakes because
 * Playwright's `context.setOffline()` does NOT make the service worker's own
 * fetch reject, so the genuine failure branch is impossible to cover end-to-end.
 */
import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleNavigationRequest, navigationFetch } from "../sw-offline";

const ORIGIN = "http://localhost:3000";

// happy-dom (like browsers) forbids constructing a Request with mode:"navigate".
// The route MATCHER checks request.mode; the pure handler under test does not,
// so a plain Request is a faithful stand-in for the handler's input.
function navRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

/** A cached navigation document stand-in for a previously-visited route. */
function cachedPage(path: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><body><main data-testid="cached-page">${path}</main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** The precached static app-shell document stand-in. */
function shellDoc(): Response {
  return new Response(
    `<!doctype html><html lang="en"><body>` +
      `<header data-testid="offline-shell-header">BUDGET</header>` +
      `<div data-testid="offline-shell-note">not preloaded</div>` +
      `</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// 260806 (user request): "all pages render from cache instantly, no matter if
// the internet is good, bad, or off — and update in the background."
//
// The old strategy raced the network against a 3s timer BEFORE looking in the
// cache, and the skip-the-wait fast path only fired when navigator.onLine was
// false. So a genuinely offline device was FAST and a barely-connected one
// blanked for three seconds — exactly backwards, and the case the user hit.
//
// A visited route is now served from cache immediately whatever the network is
// doing, and the network copy is written behind it for next time.
describe("SW navigation strategy — cached routes paint immediately", () => {
  /** A fetch that never settles, like a dead-slow link. */
  const neverSettles = () => new Promise<Response>(() => {});

  test("serves the cached document without waiting for a slow network", async () => {
    const fetchFn = vi.fn(neverSettles);
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn().mockResolvedValue(undefined);
    const matchShell = vi.fn();

    const started = Date.now();
    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      // ONLINE — this is the slow-link case, not the offline one.
      false,
    );

    expect(await res.text()).toContain("cached-page");
    // …and it did not wait for the network to decide. Timing IS the assertion
    // here: the old strategy also returned this page, three seconds later.
    expect(Date.now() - started).toBeLessThan(250);
    expect(fetchFn).toHaveBeenCalled();
  });

  test("still refreshes the cache in the background after serving it", async () => {
    const fresh = new Response("<html>fresh</html>", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(fresh);
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      vi.fn(),
      false,
    );

    expect(await res.text()).toContain("cached-page");
    // The revalidation is fire-and-forget, so give it a turn to land.
    await new Promise((r) => setTimeout(r, 0));
    expect(cachePut).toHaveBeenCalled();
  });

  test("a background refresh that fails leaves the served page alone", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      vi.fn(),
      false,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("cached-page");
    await new Promise((r) => setTimeout(r, 0));
    // Nothing was written — a failed refresh must not evict a good page.
    expect(cachePut).not.toHaveBeenCalled();
  });

  test("a background refresh that 404s does not replace the cached page", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 404 }));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn().mockResolvedValue(undefined);

    await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      vi.fn(),
      false,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(cachePut).not.toHaveBeenCalled();
  });

  // A route nobody has visited has nothing to paint, so it must still wait for
  // the real thing rather than dropping straight to the offline shell.
  test("an unvisited route still goes to the network", async () => {
    const fresh = new Response("<html>first visit</html>", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(fresh);
    const matchCache = vi.fn().mockResolvedValue(undefined);
    const cachePut = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/en/brand-new"),
      fetchFn,
      matchCache,
      cachePut,
      vi.fn(),
      false,
    );

    expect(await res.text()).toContain("first visit");
    expect(cachePut).toHaveBeenCalled();
  });
});

describe("SW navigation strategy (network-first-with-write → cached doc → app-shell)", () => {
  test("network ok 2xx → returns the live response AND writes it to the nav cache", async () => {
    const ok = new Response("<html>real page</html>", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(ok);
    const matchCache = vi.fn();
    const cachePut = vi.fn().mockResolvedValue(undefined);
    const matchShell = vi.fn();

    const req = navRequest("/en/settings");
    const res = await handleNavigationRequest(
      req,
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(res).toBe(ok);
    // NetworkFirst WRITE — successful nav cached for offline replay.
    expect(cachePut).toHaveBeenCalledTimes(1);
    const [putReq] = cachePut.mock.calls[0] as [Request, Response];
    expect(putReq).toBe(req);
    // matchCache IS consulted first now (cache-first, 260806) — it simply misses
    // here, which is what sends this request to the network.
    expect(matchShell).not.toHaveBeenCalled();
  });

  test("3xx redirect passes through unchanged and is NOT cached (auth-safe)", async () => {
    const redirect = new Response(null, {
      status: 307,
      headers: { location: "/en/sign-in" },
    });
    const fetchFn = vi.fn().mockResolvedValue(redirect);
    const matchCache = vi.fn();
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(res.status).toBe(307);
    expect(cachePut).not.toHaveBeenCalled();
    expect(matchShell).not.toHaveBeenCalled();
  });

  test("4xx passes through unchanged and is NOT cached", async () => {
    const notFound = new Response("nope", { status: 404 });
    const fetchFn = vi.fn().mockResolvedValue(notFound);
    const matchCache = vi.fn();
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(res.status).toBe(404);
    expect(cachePut).not.toHaveBeenCalled();
  });

  test("offline + VISITED route (cache hit) → returns cached real doc, header present, shell NOT used", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/settings"));
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(matchCache).toHaveBeenCalledTimes(1);
    expect(matchShell).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('data-testid="cached-page"');
  });

  test("isOffline flag + cache hit → serves cached doc IMMEDIATELY without touching the network (no 5s wait)", async () => {
    // quick-260616-spa: when navigator.onLine===false the SW must not wait out
    // the network timeout (offline fetch only hangs) — it returns the cached
    // real document right away. fetchFn must NOT be called.
    const fetchFn = vi.fn();
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      true, // isOffline
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(matchShell).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-testid="cached-page"');
  });

  test("isOffline flag + cache MISS → falls through to the network/shell path", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    const matchCache = vi.fn().mockResolvedValue(undefined);
    const cachePut = vi.fn();
    const matchShell = vi.fn().mockResolvedValue(shellDoc());

    const res = await handleNavigationRequest(
      navRequest("/uk/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      true, // isOffline
    );

    // Cache miss → still attempts the (dead) network, then the app-shell.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(matchShell).toHaveBeenCalledTimes(1);
    expect(await res.text()).toContain('data-testid="offline-shell-header"');
  });

  test("offline + UNVISITED route (cache miss) → returns the APP-SHELL doc (header chrome + note), NOT a bare full-page takeover", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    const matchCache = vi.fn().mockResolvedValue(undefined);
    const cachePut = vi.fn();
    const matchShell = vi.fn().mockResolvedValue(shellDoc());

    const res = await handleNavigationRequest(
      navRequest("/uk/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(matchShell).toHaveBeenCalledTimes(1);
    const body = await res.text();
    // Header chrome + in-app note are present (the "app, page not preloaded" model).
    expect(body).toContain('data-testid="offline-shell-header"');
    expect(body).toContain('data-testid="offline-shell-note"');
    // The OLD bare centered full-page takeover marker is gone.
    expect(body).not.toContain("offline-inline-notice");
  });

  test("5xx → treated as unreachable → cached doc when present", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 502 }));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/abc"));
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(matchCache).toHaveBeenCalledTimes(1);
    expect(matchShell).not.toHaveBeenCalled();
    // 5xx is unreachable → never written to the nav cache.
    expect(cachePut).not.toHaveBeenCalled();
    const body = await res.text();
    expect(body).toContain('data-testid="cached-page"');
  });

  test("5xx → cache MISS → app-shell doc", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 503 }));
    const matchCache = vi.fn().mockResolvedValue(undefined);
    const cachePut = vi.fn();
    const matchShell = vi.fn().mockResolvedValue(shellDoc());

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(matchShell).toHaveBeenCalledTimes(1);
    expect(await res.text()).toContain('data-testid="offline-shell-header"');
  });

  // 260625 regression guard: a SLOW but reachable ONLINE navigation must never
  // be aborted and shown the offline app-shell. The old strategy aborted the
  // fetch at `timeoutMs`, so a nav that crossed the timeout (e.g. the connection
  // pool was briefly saturated by a burst of data prefetches) fell to the
  // offline-shell even though it was online — the reserves-golden wallet-row
  // flake (the /wallets doc came back 200 at ~3010ms, just past the 3s timeout).
  test("ONLINE + SLOW network + cache MISS → waits for the network, returns the live 2xx (NOT the shell)", async () => {
    const ok = new Response("<html>real page</html>", { status: 200 });
    // Resolves AFTER the timeout — simulates a reachable-but-slow navigation.
    const fetchFn = vi.fn(
      () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(ok), 60)),
    );
    const matchCache = vi.fn().mockResolvedValue(undefined); // no cached doc
    const cachePut = vi.fn().mockResolvedValue(undefined);
    const matchShell = vi.fn().mockResolvedValue(shellDoc());

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc/wallets"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      20, // short timeout the slow fetch deliberately overruns
    );

    // The real page wins — the offline shell is NEVER served for a reachable nav.
    expect(res).toBe(ok);
    expect(matchShell).not.toHaveBeenCalled();
    // Still NetworkFirst-WRITE: the slow-but-successful nav is cached for replay.
    expect(cachePut).toHaveBeenCalledTimes(1);
  });

  test("ONLINE + SLOW network + cache HIT → serves the cached doc at the timeout (fast paint), shell NOT used", async () => {
    const slow = new Response("<html>late real page</html>", { status: 200 });
    const fetchFn = vi.fn(
      () =>
        new Promise<Response>((resolve) => setTimeout(() => resolve(slow), 60)),
    );
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/1"));
    const cachePut = vi.fn().mockResolvedValue(undefined);
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      20, // timeout fires before the 60ms fetch → serve cache
    );

    // Cached real document is served immediately at the timeout (no shell, no wait
    // for the slow network).
    expect(matchShell).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-testid="cached-page"');
  });

  test("shell MISS too → last-resort minimal 503 (never undefined)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    const matchCache = vi.fn().mockResolvedValue(undefined);
    const cachePut = vi.fn();
    const matchShell = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
    );

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(503);
  });
});

describe("offline-shell.html static document", () => {
  const shellHtml = readFileSync(
    resolve(__dirname, "../public/offline-shell.html"),
    "utf8",
  );

  test("renders the REAL header chrome (BUDGET wordmark) + in-app note, NOT a bare centered hero", () => {
    expect(shellHtml).toContain('data-testid="offline-shell-header"');
    expect(shellHtml).toContain('data-testid="offline-shell-note"');
    expect(shellHtml).toContain("BUDGET");
    // Header-on-top layout, not a full-viewport centered takeover.
    expect(shellHtml).not.toContain("min-height:100vh");
    expect(shellHtml).not.toContain("offline-inline-notice");
  });

  test("carries self-recovery JS (online/focus/visibilitychange) → reload", () => {
    // Quote-agnostic (prettier may format the inline script with double quotes).
    expect(shellHtml).toMatch(/addEventListener\(["']online["']/);
    expect(shellHtml).toMatch(/["']focus["']/);
    expect(shellHtml).toContain("visibilitychange");
    expect(shellHtml).toContain("location.reload()");
    // No /api/health probe gate.
    expect(shellHtml).not.toContain("/api/health");
  });

  test("primary action is BACK (history.back → previous already-cached page), not Try-again", () => {
    // 260617 user request: the no-cache offline screen offers a Back button
    // returning to the previous (cached) page, instead of reloading the current
    // uncached route.
    expect(shellHtml).toContain('data-i18n="back"');
    expect(shellHtml).toMatch(/history\.back\(\)/);
    // The old "Try again" (retry) primary button is gone.
    expect(shellHtml).not.toContain('data-i18n="retry"');
  });
});

// 260812: cache-first for navigations rests on ONE invariant, stated in
// sw-offline.ts itself — "the nav doc is a DATA-FREE client shell (SPA/SWR
// refactor), so it carries no stale numbers". /settings breaks it: it is a
// server component that reads the session and server-renders the display
// currency, timezone and profile INTO the document. Served from cache, a reload
// after changing the display currency painted the OLD value, and no React Query
// refetch could correct it because the value never came from a query.
//
// So the rule narrows: routes that server-render user data go to the network
// first. They keep the cache as an OFFLINE fallback — losing the instant paint
// on one rarely-visited page is the whole cost.
describe("SW navigation strategy — routes that server-render user data", () => {
  test("/settings goes to the network even when a cached copy exists", async () => {
    const fresh = new Response(
      `<!doctype html><html><body><main data-testid="fresh-page">UAH</main></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
    const fetchFn = vi.fn().mockResolvedValue(fresh);
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/settings"));

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      false,
    );

    expect(await res.text()).toContain("fresh-page");
  });

  test("every locale prefix is covered, not just /en", async () => {
    const fresh = new Response(`<html><body>fresh-pl</body></html>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const res = await handleNavigationRequest(
      navRequest("/pl/settings"),
      vi.fn().mockResolvedValue(fresh),
      vi.fn().mockResolvedValue(cachedPage("/pl/settings")),
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      false,
    );

    expect(await res.text()).toContain("fresh-pl");
  });

  test("offline, it still falls back to the cached copy", async () => {
    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      vi.fn().mockRejectedValue(new Error("offline")),
      vi.fn().mockResolvedValue(cachedPage("/en/settings")),
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      true,
    );

    expect(await res.text()).toContain("cached-page");
  });

  test("a data-free route still paints from cache immediately", async () => {
    const fetchFn = vi.fn(() => new Promise<Response>(() => {}));
    const res = await handleNavigationRequest(
      navRequest("/en/budgets/1"),
      fetchFn,
      vi.fn().mockResolvedValue(cachedPage("/en/budgets/1")),
      vi.fn().mockResolvedValue(undefined),
      vi.fn(),
      false,
    );

    expect(await res.text()).toContain("cached-page");
  });
});

/**
 * navigationFetch — spend the browser's preload instead of racing it.
 *
 * The SW sets navigationPreload: true, so the browser fires the document
 * request itself. The generic navigation handler then ignored `preloadResponse`
 * and issued its OWN fetch(req), which hit the server TWICE for every uncached
 * navigation. The code already knew — it fixed it for /auth/*, where the
 * duplicate sent verification emails twice, and left the waste everywhere else.
 */
describe("navigationFetch — the browser already asked", () => {
  const req = navRequest("/en/budgets/1");

  test("uses the preload response instead of fetching again", async () => {
    const preloaded = new Response("<html>preloaded</html>", { status: 200 });
    const fallback = vi.fn();
    const f = navigationFetch(
      { preloadResponse: Promise.resolve(preloaded) },
      fallback,
    );
    expect(await (await f(req)).text()).toContain("preloaded");
    expect(fallback).not.toHaveBeenCalled();
  });

  test("fetches when there is no preload at all", async () => {
    const fallback = vi
      .fn()
      .mockResolvedValue(new Response("<html>network</html>", { status: 200 }));
    const f = navigationFetch({}, fallback);
    expect(await (await f(req)).text()).toContain("network");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test("fetches when the preload resolves to nothing", async () => {
    const fallback = vi
      .fn()
      .mockResolvedValue(new Response("<html>network</html>", { status: 200 }));
    const f = navigationFetch(
      { preloadResponse: Promise.resolve(undefined) },
      fallback,
    );
    expect(await (await f(req)).text()).toContain("network");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  // A preload is a single response. The cache-first path serves the cached
  // document and revalidates behind it, so the same fetch function can be asked
  // twice; the second ask must go to the network rather than re-read a body
  // that has already been consumed.
  test("spends the preload once, then goes to the network", async () => {
    const preloaded = new Response("<html>preloaded</html>", { status: 200 });
    const fallback = vi
      .fn()
      .mockResolvedValue(new Response("<html>network</html>", { status: 200 }));
    const f = navigationFetch(
      { preloadResponse: Promise.resolve(preloaded) },
      fallback,
    );
    expect(await (await f(req)).text()).toContain("preloaded");
    expect(await (await f(req)).text()).toContain("network");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  // A preload that REJECTS (the browser cancelled it, the link dropped) must not
  // take the navigation down with it.
  test("falls back to the network when the preload rejects", async () => {
    const fallback = vi
      .fn()
      .mockResolvedValue(new Response("<html>network</html>", { status: 200 }));
    const f = navigationFetch(
      { preloadResponse: Promise.reject(new Error("cancelled")) },
      fallback,
    );
    expect(await (await f(req)).text()).toContain("network");
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
