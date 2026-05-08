import { defineConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "tests/e2e/features/**/*.feature",
  steps: ["tests/e2e/steps/**/*.ts", "tests/e2e/fixtures/**/*.ts"],
});

export default defineConfig({
  testDir,
  timeout: 30000,
  retries: process.env["CI"] ? 1 : 0,
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  reporter: [["html", { outputFolder: "playwright-report" }]],
});
