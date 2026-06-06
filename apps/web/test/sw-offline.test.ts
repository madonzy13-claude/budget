/**
 * Service-worker offline / server-down strategy (05-18).
 *
 * Regression guard for the "infinite redirect loop when the backend is
 * unreachable" bug. Root cause: the SW navigation handler used to fall back to a
 * STALE cached page shell (an authenticated app shell or /sign-in) when the
 * network failed; that shell re-ran its client-side auth/locale logic against a
 * dead server and bounced sign-in <-> home forever, because the intended
 * fallback target (a DYNAMIC /<locale>/server-down route) is never added to the
 * Serwist precache as a navigable HTML document.
 *
 * Fix: on ANY navigation failure the SW returns a STATIC, non-redirecting
 * /offline.html (precached via public/) — never a cached shell. These tests
 * drive the pure handler with injected fetch/cache fakes because Playwright's
 * `context.setOffline()` does NOT make the service worker's own fetch reject, so
 * the genuine failure branch is impossible to cover end-to-end.
 */
import { describe, test, expect, vi } from "vitest";
import {
  OFFLINE_FALLBACK_URL,
  buildOfflineDocument,
  handleNavigationRequest,
} from "../sw-offline";

const ORIGIN = "http://localhost:3000";

// happy-dom (like browsers) forbids constructing a Request with mode:"navigate".
// The route MATCHER checks request.mode; the pure handler under test does not,
// so a plain Request is a faithful stand-in for the handler's input.
function navRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

/** A precached /offline.html stand-in: a minimal but realistic document. */
function precachedOfflineDoc(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><title>Budget</title></head><body><main data-testid="server-down-card"><h1>We can't reach the server</h1></main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

describe("SW navigation strategy when the backend is unreachable", () => {
  test("network rejection (offline / connect-refused) serves the offline document, not a stale shell", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const makeOffline = vi
      .fn()
      .mockResolvedValue(new Response("offline", { status: 503 }));

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      makeOffline,
    );

    expect(makeOffline).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  test("a 5xx response is treated as server-down and serves the offline document", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 502 }));
    const makeOffline = vi
      .fn()
      .mockResolvedValue(new Response("offline", { status: 503 }));

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      makeOffline,
    );

    expect(makeOffline).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
  });

  test("a successful navigation passes through untouched (no offline fallback, no loop)", async () => {
    const ok = new Response("<html>real page</html>", { status: 200 });
    const fetchFn = vi.fn().mockResolvedValue(ok);
    const makeOffline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      makeOffline,
    );

    expect(makeOffline).not.toHaveBeenCalled();
    expect(res).toBe(ok);
  });

  test("a 3xx/redirect response is NOT swallowed — server-side redirects (e.g. to /server-down) still work", async () => {
    // status 307 must pass through so the existing server-side
    // ServerUnavailableError -> /server-down redirect is preserved.
    const redirect = new Response(null, {
      status: 307,
      headers: { location: "/en/server-down" },
    });
    const fetchFn = vi.fn().mockResolvedValue(redirect);
    const makeOffline = vi.fn();

    const res = await handleNavigationRequest(
      navRequest("/en/budgets/abc"),
      fetchFn,
      makeOffline,
    );

    expect(makeOffline).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
  });

  test("the offline fallback never resolves to a redirect (a single failed dependency cannot loop)", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    // The real offline builder, backed by a precache HIT.
    const matchOffline = vi.fn().mockResolvedValue(precachedOfflineDoc());
    const makeOffline = (req: Request) =>
      buildOfflineDocument(req, matchOffline);

    const res = await handleNavigationRequest(
      navRequest("/en/settings"),
      fetchFn,
      makeOffline,
    );

    expect(res.status).toBe(503); // not 3xx
    expect(res.headers.get("location")).toBeNull();
    const body = await res.text();
    expect(body).toContain('data-testid="server-down-card"');
  });
});

describe("buildOfflineDocument", () => {
  test("precache HIT: returns 503 server-down card and seeds originating path + locale for Retry", async () => {
    const matchOffline = vi.fn().mockResolvedValue(precachedOfflineDoc());

    const res = await buildOfflineDocument(
      navRequest("/pl/budgets/abc?tab=reserves"),
      matchOffline,
    );

    expect(matchOffline).toHaveBeenCalledWith(OFFLINE_FALLBACK_URL);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    const body = await res.text();
    // Injected globals let the doc's Retry return the user where they were.
    expect(body).toContain("window.__OFFLINE_NEXT=");
    expect(body).toContain("/pl/budgets/abc");
    expect(body).toContain('window.__OFFLINE_LANG="pl"');
    expect(body).toContain('data-testid="server-down-card"');
  });

  test("precache MISS: still returns a localized inline 503 (never the browser blank screen)", async () => {
    const matchOffline = vi.fn().mockResolvedValue(undefined);

    const res = await buildOfflineDocument(
      navRequest("/uk/settings"),
      matchOffline,
    );

    expect(res.status).toBe(503);
    const body = await res.text();
    // The inline last-resort HTML uses terse unquoted attributes.
    expect(body).toContain("data-testid=server-down-card");
    // Ukrainian title from the inline fallback table.
    expect(body).toContain("Не вдається з'єднатися");
    expect(body).toContain('lang="uk"');
  });

  test("unknown / missing locale defaults to en", async () => {
    const matchOffline = vi.fn().mockResolvedValue(undefined);
    const res = await buildOfflineDocument(navRequest("/"), matchOffline);
    const body = await res.text();
    expect(body).toContain("We can't reach the server");
    expect(body).toContain('lang="en"');
  });
});
