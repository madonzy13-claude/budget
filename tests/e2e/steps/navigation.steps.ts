import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";

const { When, Then } = createBdd(test);

When("I navigate to {string}", async ({ page }, path: string) => {
  await page.goto(path);
});

Then("I am redirected to a sign-in page", async ({ page }) => {
  await expect(page).toHaveURL(/\/(en|pl|uk)\/sign-in/, { timeout: 10000 });
});

Then("I am redirected to a workspaces page", async ({ page }) => {
  await expect(page).toHaveURL(/\/(en|pl|uk)\/workspaces/, { timeout: 10000 });
});
