import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /tmp-kids\.spec\.ts/,
  timeout: 300_000,
  reporter: "line",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://budget-dev.madonzy.com",
    ...devices["Desktop Chrome"],
  },
});
