import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated config for raw (non-BDD) Playwright specs under `e2e/*.spec.ts`.
 *
 * The primary `playwright.config.ts` sets `testDir` to the playwright-bdd
 * generated directory (`.features-gen`), so plain `.spec.ts` files there are
 * invisible to it. These specs drive low-level network interception / PWA
 * behaviour (service-worker cache isolation, backend-unreachable handling)
 * that does not map onto Gherkin steps. Run with:
 *
 *   PLAYWRIGHT_BASE_URL=$APP_URL bunx playwright test -c playwright.specs.config.ts
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
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
  ],
});
