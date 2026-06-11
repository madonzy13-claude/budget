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

describe("(app) shell clears iOS bottom UI", () => {
  it("pads the <main> scroll surface with env(safe-area-inset-bottom)", () => {
    const mainTag = layout.match(/<main className=[^>]*>/)?.[0] ?? "";
    expect(mainTag).toContain("safe-area-inset-bottom");
  });
});
