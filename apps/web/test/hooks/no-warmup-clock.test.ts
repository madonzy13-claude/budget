/**
 * no-warmup-clock.test.ts — the Overview sections must not wait on a timer.
 *
 * They used to: useStagedWarmup released them 700ms apart, so the last one
 * started 2.8s after the page. Measured on a cold load, that left the warm-up
 * 3,553ms wide with 1,781ms of it idle. The concurrency cap in request-pool.ts
 * does the throttling now, and it does it by watching what is in flight rather
 * than by watching a clock.
 *
 * This is a structural guard, not a behavioural one: it asserts the clock is
 * GONE. A behavioural test would have to fake timers and could pass just as
 * happily against a 700ms wait that nobody advanced.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const SECTIONS = [
  "src/components/budgeting/overview/planned-section.tsx",
  "src/components/budgeting/overview/overspent-reserves-section.tsx",
  "src/components/budgeting/overview/wealth-section.tsx",
];

describe("Overview warm-up has no clock", () => {
  test("use-staged-warmup is gone", () => {
    expect(existsSync(join(root, "src/hooks/use-staged-warmup.ts"))).toBe(
      false,
    );
  });

  for (const rel of SECTIONS) {
    test(`${rel.split("/").pop()} does not stage its fetch`, () => {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src).not.toContain("useStagedWarmup");
      expect(src).not.toContain("WARMUP_WAVE_MS");
    });
  }

  // The prefetcher held the Settings tier behind the priority tier plus a 4s
  // fallback timer. Both are the same mistake in a different place.
  test("the tab prefetcher does not hold one tier behind another", () => {
    const src = readFileSync(
      root + "/src/hooks/use-prefetch-budget-tabs.ts",
      "utf8",
    );
    expect(src).not.toContain("setTimeout");
    expect(src).not.toContain("runDeferredOnce");
  });

  // The cap is what makes removing the clocks safe, so the prefetcher has to
  // actually be using it.
  test("the tab prefetcher fetches through the pool", () => {
    const src = readFileSync(
      root + "/src/hooks/use-prefetch-budget-tabs.ts",
      "utf8",
    );
    expect(src).toContain("backgroundApiFetch");
  });
});
