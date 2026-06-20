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
import { handleNavigationRequest } from "../sw-offline";

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
    expect(matchCache).not.toHaveBeenCalled();
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
    expect(matchCache).not.toHaveBeenCalled();
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
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/settings"));
    const cachePut = vi.fn();
    const matchShell = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      cachePut,
      matchShell,
      3_000,
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
      3_000,
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
