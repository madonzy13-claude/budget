/**
 * Service-worker navigation strategy (robust-minimal offline, 260614-q1v).
 *
 * NEW contract: network-first, fall back to the CACHED page; only on a cache
 * MISS return a minimal self-recovering inline notice. The OLD strategy fell
 * back to a STATIC /offline.html 503 with a 3-probe /api/health recovery gate
 * (decideOfflineRecovery / sanitizeNext / buildOfflineDocument) — all removed.
 *
 * These tests drive the pure handler with injected fetch/cache fakes because
 * Playwright's `context.setOffline()` does NOT make the service worker's own
 * fetch reject, so the genuine failure branch is impossible to cover end-to-end.
 */
import { describe, test, expect, vi } from "vitest";
import {
  handleNavigationRequest,
  buildInlineOfflineNotice,
} from "../sw-offline";

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

const noNotice = vi.fn(() => buildInlineOfflineNotice(navRequest("/en")));

describe("SW navigation strategy (network-first → cached page → inline notice)", () => {
  test("network ok → returns the live response", async () => {
    const ok = new Response("<html>real page</html>", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(ok);
    const matchCache = vi.fn();
    const makeInline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      makeInline,
    );

    expect(res).toBe(ok);
    expect(matchCache).not.toHaveBeenCalled();
    expect(makeInline).not.toHaveBeenCalled();
  });

  test("network ok 4xx (<500) returns it unchanged (auth redirect / 404 safe)", async () => {
    // A 307 server-side redirect AND a 404 must pass through untouched.
    const redirect = new Response(null, {
      status: 307,
      headers: { location: "/en/sign-in" },
    });
    const fetchFn = vi.fn().mockResolvedValue(redirect);
    const matchCache = vi.fn();
    const makeInline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      matchCache,
      makeInline,
    );

    expect(res.status).toBe(307);
    expect(matchCache).not.toHaveBeenCalled();
    expect(makeInline).not.toHaveBeenCalled();
  });

  test("network throw + CACHED page present → returns the cached navigation doc", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/settings"));
    const makeInline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      makeInline,
    );

    expect(matchCache).toHaveBeenCalledTimes(1);
    expect(makeInline).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('data-testid="cached-page"');
  });

  test("network throw + cache MISS → returns minimal inline notice (503), no health probe", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    const matchCache = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/uk/settings"),
      fetchFn,
      matchCache,
      (req) => buildInlineOfflineNotice(req),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("location")).toBeNull();
    const body = await res.text();
    expect(body).toContain("data-testid=offline-inline-notice");
    // Localized for the request locale.
    expect(body).toContain('lang="uk"');
    expect(body).toContain("Ви офлайн");
    // Self-recovering, NOT a /api/health gate.
    expect(body).not.toContain("/api/health");
    expect(body).toContain("location.reload()");
  });

  test("5xx → treated as unreachable → cached page when present", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 502 }));
    const matchCache = vi.fn().mockResolvedValue(cachedPage("/en/budgets/abc"));
    const makeInline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      matchCache,
      makeInline,
    );

    expect(matchCache).toHaveBeenCalledTimes(1);
    expect(makeInline).not.toHaveBeenCalled();
    const body = await res.text();
    expect(body).toContain('data-testid="cached-page"');
  });

  test("5xx → cache MISS → inline notice", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 503 }));
    const matchCache = vi.fn().mockResolvedValue(undefined);

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      matchCache,
      (req) => buildInlineOfflineNotice(req),
    );

    expect(res.status).toBe(503);
    expect(await res.text()).toContain("data-testid=offline-inline-notice");
  });
});

describe("buildInlineOfflineNotice", () => {
  test("localized title + self-recovery, no health gate", async () => {
    const res = buildInlineOfflineNotice(navRequest("/pl/budgets/abc"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const body = await res.text();
    expect(body).toContain('lang="pl"');
    expect(body).toContain("Jesteś offline");
    expect(body).toContain("addEventListener('online'");
    expect(body).not.toContain("/api/health");
  });

  test("unknown / missing locale defaults to en", async () => {
    const res = buildInlineOfflineNotice(navRequest("/"));
    const body = await res.text();
    expect(body).toContain("You're offline");
    expect(body).toContain('lang="en"');
  });

  // noNotice exists only to satisfy importers if referenced; keep it exercised.
  test("helper builds an en notice by default", async () => {
    const res = noNotice();
    expect(await res.text()).toContain('lang="en"');
  });
});
