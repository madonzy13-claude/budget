import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
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
});

export default defineConfig({
  testDir,
  fullyParallel: false,
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
