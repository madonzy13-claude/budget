/**
 * @tasks-redesign — Backend-unreachable robustness (05-18).
 *
 * Regression guard for the "infinite redirect loop / dead-end when the backend
 * is down" bug. When the origin is unreachable, an installed PWA must render a
 * clear server-down / offline screen and STOP — never bounce through an endless
 * redirect chain, never strand the user on a blank shell or a sign-in form that
 * itself needs the server.
 *
 * Test split (and WHY):
 *   - The genuine "SW fetch rejects while offline" branch is covered by the
 *     deterministic unit test in test/sw-offline.test.ts, because Playwright's
 *     `context.setOffline(true)` does NOT make the service worker's own fetch
 *     reject — it only blocks the renderer — so the failure branch is impossible
 *     to force end-to-end.
 *   - Here we verify the OTHER half end-to-end against the live stack:
 *       (A) the SW precaches a NAVIGABLE /offline.html document (the old
 *           fallback target — a dynamic /<locale>/server-down route — was never
 *           precached as HTML, which is what caused the loop), and that document
 *           renders the DESIGN.md server-down card and does NOT redirect; and
 *       (B) failing every /auth + /api request at the edge terminates the
 *           redirect chain (bounded navigation count) — no loop.
 *
 * Raw Playwright spec (not BDD) for the same reason cross-tenant-cache.spec.ts
 * is: low-level SW + network-interception behaviour that does not map onto
 * Gherkin steps and needs no seeded user. Run with playwright.specs.config.ts.
 *
 * NOTE: service workers require a SECURE context. Over plain-HTTP Tailscale
 * (the default APP_URL) `navigator.serviceWorker` is undefined, so the SW parts
 * (A) auto-skip there and must be run against http://localhost:3000.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// A bounded redirect chain ( / -> /en -> ... -> terminal ) is fine; a loop is
// not. 8 main-frame navigations sits generously above any legitimate chain yet
// far below a runaway loop (dozens).
const MAX_NAVIGATIONS = 8;

function countNavigations(page: Page): { get: () => number; urls: string[] } {
  let count = 0;
  const urls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      count += 1;
      urls.push(frame.url());
    }
  });
  return { get: () => count, urls };
}

async function serviceWorkerSupported(page: Page): Promise<boolean> {
  return page.evaluate(() => "serviceWorker" in navigator);
}

async function warmServiceWorker(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/en/sign-in`, { waitUntil: "load" });
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg?.active && !!navigator.serviceWorker.controller;
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(750);
}

test.describe("@tasks-redesign backend unreachable", () => {
  test("(A) SW precaches a non-redirecting /offline.html server-down document", async ({
    browser,
  }) => {
    const context: BrowserContext = await browser.newContext({
      baseURL: BASE_URL,
      serviceWorkers: "allow",
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/en/sign-in`, { waitUntil: "load" });

    if (!(await serviceWorkerSupported(page))) {
      test.skip(
        true,
        "Service workers need a secure context — run against http://localhost:3000",
      );
    }

    await warmServiceWorker(page);

    // The offline fallback MUST be in the precache as a navigable HTML doc.
    // This is the core regression: the previous dynamic-route target was not.
    const offlineMatch = await page.evaluate(async () => {
      const m = await caches.match("/offline.html", { ignoreSearch: true });
      return m
        ? { status: m.status, type: m.headers.get("content-type") }
        : null;
    });
    expect(offlineMatch, "/offline.html is not precached").not.toBeNull();
    expect(offlineMatch?.type).toContain("text/html");

    // The document renders the server-down card and does NOT redirect away.
    const nav = countNavigations(page);
    await page.goto(`${BASE_URL}/offline.html?next=/en/settings`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(500);
    await expect(page.getByTestId("server-down-card")).toBeVisible();
    await expect(page.getByTestId("server-down-retry-button")).toBeVisible();
    expect(
      nav.get(),
      `offline.html navigated ${nav.get()} times (urls: ${nav.urls.join(
        " -> ",
      )}) — it must not redirect`,
    ).toBeLessThan(3);
    // Still parked on the offline doc — never bounced to /sign-in or a shell.
    expect(page.url()).toContain("/offline.html");

    await context.close();
  });

  test("(B) edge errors on /auth + /api terminate, not a redirect loop", async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    // Fail every auth + data request at the edge.
    await page.route("**/auth/**", (route) => route.abort());
    await page.route("**/api/**", (route) => route.abort());

    const nav = countNavigations(page);
    await page
      .goto(`${BASE_URL}/en/settings`, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    await page.waitForTimeout(2_500);

    expect(
      nav.get(),
      `edge-error navigation produced ${nav.get()} navigations (urls: ${nav.urls.join(
        " -> ",
      )}) — redirect loop`,
    ).toBeLessThan(MAX_NAVIGATIONS);

    await context.close();
  });
});
