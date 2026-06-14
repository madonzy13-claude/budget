/**
 * offline-shell-wiring.test.ts — guards that the global offline/PWA indicators
 * are actually MOUNTED in the (app) shell. The components themselves are tested
 * elsewhere, but they were built once and mounted nowhere (dead code); this
 * catches that regression — a component test on the component alone cannot.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(
  resolve(__dirname, "../src/app/[locale]/(app)/layout.tsx"),
  "utf8",
);

describe("(app) shell wires the global PWA/offline surfaces", () => {
  it.each([["OfflineStatusBadge"], ["OfflineResilience"], ["InstallBanner"]])(
    "renders <%s /> in the app layout",
    (component) => {
      expect(layout).toMatch(new RegExp(`import\\s*{[^}]*\\b${component}\\b`));
      expect(layout).toMatch(new RegExp(`<${component}\\b`));
    },
  );
});
