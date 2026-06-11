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

  it("global.css pads the scroll surface in browser mode and zeroes it in standalone", () => {
    // Browser Safari floats its bottom bar OVER the page → env() clearance
    // needed. Standalone has no bar; the same padding rendered as a dead
    // 34px band above the home indicator (UAT regression), so display-mode
    // standalone must reset it to 0.
    expect(globalCss).toMatch(
      /data-shell-scroll[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/,
    );
    expect(globalCss).toMatch(
      /@media\s*\(display-mode:\s*standalone\)[\s\S]*data-shell-scroll[^}]*padding-bottom:\s*0/,
    );
  });

  it("html/body track the dynamic viewport (100dvh) so the h-dvh shell is never clipped", () => {
    // height:100% on iOS is the static ICB while the inner shell is h-dvh —
    // when Safari's bar collapses the shell outgrows the overflow:hidden
    // body and the bottom rows get clipped into a dead black band.
    expect(globalCss).toMatch(/height:\s*100dvh/);
  });

  it("viewport-fit=cover is set so env(safe-area-inset-*) resolves on iOS", () => {
    expect(rootLayout).toMatch(/viewportFit:\s*["']cover["']/);
  });

  it("header compensates the top inset once viewport-fit=cover activates it", () => {
    const headerTag = layout.match(/<header className=[^>]*>/)?.[0] ?? "";
    expect(headerTag).toContain("safe-area-inset-top");
  });
});
