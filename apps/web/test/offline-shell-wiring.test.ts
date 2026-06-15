/**
 * offline-shell-wiring.test.ts — guards that the global offline/PWA surfaces are
 * actually MOUNTED/WIRED in the (app) shell + service worker. The components
 * themselves are tested elsewhere, but they were built once and mounted nowhere
 * (dead code); this catches that regression — a component test on the component
 * alone cannot.
 *
 * 260614-rwt: the offline indicator MOVED from the layout body into the TopNav
 * header, and the SW now precaches + serves a static app-shell document and
 * writes a named nav cache. These assertions lock that wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(
  resolve(__dirname, "../src/app/[locale]/(app)/layout.tsx"),
  "utf8",
);
const topNav = readFileSync(
  resolve(__dirname, "../src/components/budgeting/top-nav.tsx"),
  "utf8",
);
const sw = readFileSync(resolve(__dirname, "../sw.ts"), "utf8");

describe("(app) shell wires the global PWA/offline surfaces", () => {
  it.each([["OfflineResilience"], ["InstallBanner"]])(
    "renders <%s /> in the app layout",
    (component) => {
      expect(layout).toMatch(new RegExp(`import\\s*{[^}]*\\b${component}\\b`));
      expect(layout).toMatch(new RegExp(`<${component}\\b`));
    },
  );

  it("offline staleness bar is mounted below the header in the (app) layout", () => {
    // 260615-e8s round 3: the in-header icon was replaced by a full-width red
    // staleness bar mounted in the layout body, just below the header.
    expect(layout).toMatch(/import\s*{[^}]*\bOfflineStaleBar\b/);
    expect(layout).toMatch(/<OfflineStaleBar\b/);
    // The old in-header icon is gone from the TopNav.
    expect(topNav).not.toMatch(/OfflineStatusBadge/);
  });

  it("nav-cache warmer is mounted in the (app) layout", () => {
    // 260615-e8s round 4: warms the SW nav-doc cache (home + current route)
    // while online so a cold offline open serves the real cached page.
    expect(layout).toMatch(/import\s*{[^}]*\bNavCacheWarmer\b/);
    expect(layout).toMatch(/<NavCacheWarmer\b/);
  });
});

describe("service worker wires the app-shell offline nav", () => {
  it("references the precached offline-shell document", () => {
    expect(sw).toContain("/offline-shell.html");
  });

  it("uses a named nav-docs cache for NetworkFirst-with-write", () => {
    expect(sw).toContain("nav-docs-v1");
  });

  it("keeps /api NetworkOnly (tenant isolation denylist intact)", () => {
    expect(sw).toContain("NetworkOnly");
    expect(sw).toMatch(/startsWith\(["']\/api\//);
  });

  it("no longer references the removed bare full-page takeover builder", () => {
    expect(sw).not.toContain("buildInlineOfflineNotice");
  });

  it("handles WARM_ROUTES messages to proactively cache nav docs", () => {
    expect(sw).toContain("WARM_ROUTES");
    expect(sw).toMatch(/addEventListener\(["']message["']/);
  });

  it("caches Next RSC payloads (NetworkFirst) for offline soft-navigation", () => {
    // 260615-e8s round 5: client-side nav fetches RSC flight payloads; caching
    // them lets soft-nav to visited/prefetched routes work offline.
    expect(sw).toContain("rsc-v1");
    expect(sw).toMatch(/headers\.get\(["']RSC["']\)/);
    expect(sw).toContain("NetworkFirst");
    // The _rsc cache-buster is stripped from the key so offline requests match.
    expect(sw).toContain("_rsc");
  });
});
