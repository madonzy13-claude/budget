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

  it("offline indicator is mounted in the TopNav header, not the layout body", () => {
    // Moved into the header chrome (zero-height inline pill).
    expect(topNav).toMatch(/import\s*{[^}]*\bOfflineStatusBadge\b/);
    expect(topNav).toMatch(/<OfflineStatusBadge\b/);
    // No longer rendered in the layout body.
    expect(layout).not.toMatch(/<OfflineStatusBadge\b/);
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
});
