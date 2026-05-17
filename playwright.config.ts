import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: ["tests/e2e/steps/**/*.ts", "tests/e2e/fixtures/**/*.ts"],
});

export default defineConfig({
  testDir,
  timeout: 60000,
  retries: process.env["CI"] ? 2 : 0,
  // Sequential in CI to avoid same-domain cookie/session races between
  // parallel sign-up scenarios. Local dev keeps default parallelism.
  workers: process.env["CI"] ? 1 : undefined,
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  reporter: [["html", { outputFolder: "playwright-report" }]],
});
