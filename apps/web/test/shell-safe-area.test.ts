/**
 * shell-safe-area.test.ts — UAT-08 regression guard: iOS Safari's floating
 * bottom bar overlays the page; without env(safe-area-inset-bottom) padding
 * on the shell's scroll surface the last rows are unreachable behind the bar
 * (browser only — standalone has no bar, just the home indicator).
 * Same source-grep style as offline-shell-wiring.test.ts: layout is a server
 * component with session logic, so mounting it in jsdom is not practical.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(
  resolve(__dirname, "../src/app/[locale]/(app)/layout.tsx"),
  "utf8",
);
const globalCss = readFileSync(
  resolve(__dirname, "../src/app/global.css"),
  "utf8",
);
const rootLayout = readFileSync(
  resolve(__dirname, "../src/app/layout.tsx"),
  "utf8",
);

describe("(app) shell clears iOS bottom UI", () => {
  it("marks the <main> scroll surface for the browser-only bottom clearance rule", () => {
    const mainTag = layout.match(/<main[^>]*className=[^>]*>/)?.[0] ?? "";
    expect(mainTag).toContain("data-shell-scroll");
  });

  it("standalone gets a real ::after spacer — iOS drops scroll-container padding-bottom", () => {
    // WebKit ignores padding-bottom on the overflow element itself when the
    // inner container scrolls (standalone path) — the PWA's last row stayed
    // glued to the screen edge with padding alone. A generated flex child
    // is real content, so the scroll range includes it.
    const standaloneBlock = globalCss.match(
      /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(standaloneBlock).toBeTruthy();
    expect(standaloneBlock).toMatch(
      /data-shell-scroll\]::after[^}]*height:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*64px\)/,
    );
  });

  it("browser display-mode unlocks native page scroll (bar collapse needs PAGE scroll)", () => {
    // iOS Safari only collapses its bottom bar and extends the viewport
    // edge-to-edge (google.com behavior) when the page itself scrolls.
    // The locked-body + inner-scroll architecture is standalone-only.
    const browserBlock = globalCss.match(
      /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(browserBlock).toBeTruthy();
    expect(browserBlock).toMatch(/height:\s*auto/);
    expect(browserBlock).toMatch(/overflow:\s*visible/);
    expect(browserBlock).toMatch(/data-shell-scroll[^}]*overflow-y:\s*visible/);
  });

  it("browser mode pins the header and offsets the BDP tab band below it", () => {
    // Native page scroll would carry the header away; UAT feedback wants it
    // pinned like standalone. The tab band (sticky top-0) must then stick
    // BELOW the 65px header (h-16 + 1px border) instead of sliding under it.
    const browserBlock = globalCss.match(
      /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(browserBlock).toMatch(
      /data-shell-header[^}]*position:\s*sticky[^}]*top:\s*0/,
    );
    expect(browserBlock).toMatch(
      /data-bdp-tabs[^}]*top:\s*calc\(4rem \+ 1px\)/,
    );
    expect(layout).toMatch(/<header[^>]*data-shell-header/);
    const bdpLayout = readFileSync(
      resolve(__dirname, "../src/app/[locale]/(app)/budgets/[id]/layout.tsx"),
      "utf8",
    );
    expect(bdpLayout).toMatch(/data-bdp-tabs/);
  });

  it("custom pull-to-refresh stays standalone-only (browser gets native PTR)", () => {
    const ptr = readFileSync(
      resolve(__dirname, "../src/components/common/pull-to-refresh.tsx"),
      "utf8",
    );
    expect(ptr).toMatch(/display-mode:\s*standalone/);
  });

  it("html/body and the shell are sized to the large viewport (100lvh)", () => {
    // iOS Safari never resizes the viewport when only an INNER container
    // scrolls (page scroll is locked for the custom PTR), so a dvh/svh-sized
    // shell leaves a permanent dead band where the expanded bar was. lvh
    // paints edge-to-edge; content slides under the translucent bar like a
    // native list. In standalone lvh == screen height — no change there.
    expect(globalCss).toMatch(/height:\s*100lvh/);
    expect(layout).toMatch(/h-lvh/);
  });

  it("viewport-fit=cover is set so env(safe-area-inset-*) resolves on iOS", () => {
    expect(rootLayout).toMatch(/viewportFit:\s*["']cover["']/);
  });

  it("header compensates the top inset once viewport-fit=cover activates it", () => {
    const headerTag = layout.match(/<header[^>]*>/)?.[0] ?? "";
    expect(headerTag).toContain("safe-area-inset-top");
  });
});
