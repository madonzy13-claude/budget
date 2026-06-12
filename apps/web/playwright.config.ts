import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  // featuresRoot must be the repo root: feature files live both in
  // apps/web/e2e/features and the top-level tests/e2e/features tree.
  // Without this, playwright-bdd rejects the out-of-apps/web features.
  featuresRoot: "../..",
  features: [
    "e2e/features/**/*.feature",
    "../../tests/e2e/features/**/*.feature",
  ],
  steps: [
    "e2e/page-objects/**/*.ts",
    "e2e/fixtures/**/*.ts",
    "e2e/steps/**/*.ts",
    "../../tests/e2e/steps/**/*.ts",
    "../../tests/e2e/fixtures/**/*.ts",
    "../../tests/e2e/pages/**/*.ts",
  ],
  // Scenarios tagged @skip-phase-05-debt are excluded — each carries an
  // inline TODO with the re-enable condition (v1.1 surface not yet shipped).
  // @skip-phase-07-debt + @skip-tasks-redesign-debt are honored via the
  // --grep-invert flag on the runner (see Makefile / make test-e2e).
  tags: "not @skip-phase-05-debt",
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  // Always serial (1 worker). Two reasons: (1) parallel workers race on
  // same-domain auth cookies / sessions between concurrent sign-up scenarios;
  // (2) the @reserves-golden walk drives a PROCESS-GLOBAL gated test clock
  // (POST /test/clock moves the API's serverNow May→June) — any concurrent
  // scenario would observe that overridden clock, so the suite must run one
  // scenario at a time. CI already used 1; this makes local match (determinism
  // over speed). A per-request (AsyncLocalStorage) clock would restore
  // parallelism but is a larger change.
  workers: 1,
  // playwright-bdd 8.5.0 has a known race condition where the first scenario in
  // a feature file occasionally hits "bddTestData not found" when picked up by
  // a fresh worker before its bdd-data registry is populated. A single retry
  // masks the race reliably. Removable once playwright-bdd ships a fix.
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    // ── Geometry projects (SHELL-R12 browser-mode multi-viewport proofs) ──
    // These run the @tasks-geometry scenarios across phone/phablet/desktop
    // widths to prove banner placement, bottom clearance, and shell sizing
    // are device-agnostic. Chromium only — no engine emulates display-mode:
    // standalone or real env() insets; those invariants stay Vitest-guarded.
    {
      name: "geom-320",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "geom-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "geom-430",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "geom-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    // WebKit (closest to Safari for flex/scroll geometry in browser mode).
    // TODO: enable once `bunx playwright install webkit` succeeds in CI and
    // the fresh-user auth flow is stable on WebKit without destabilising the
    // suite. Leave commented until validated (SHELL-R12 TODO).
    // {
    //   name: "webkit-geom",
    //   use: { ...devices["Desktop Safari"], viewport: { width: 390, height: 844 } },
    // },
  ],
});
