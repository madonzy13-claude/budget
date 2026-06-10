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

// v1.1: /workspaces is gone. Authenticated landing is the locale root
// `/${locale}` which renders apps/web/src/app/[locale]/(app)/page.tsx.
//
// Phase 6 (06-02 D-08 incomplete-onboarding guard): users with
// onboarding_progress.completed_at === null AND no existing budget are
// redirected by the (app) layout to `/${locale}/budgets/new` (the wizard
// welcome). For "fresh user just verified" scenarios that is the genuine
// app entrypoint, so the regex now matches both `/${locale}/` and
// `/${locale}/budgets/new` — the "app home" for first-time users.
Then("I am redirected to the app home page", async ({ page }) => {
  // Matches: /en, /en/, /en/budgets/new, /en/budgets/new/ — all locale roots
  // and the Phase 6 onboarding-wizard entrypoint.
  await expect(page).toHaveURL(/\/(en|pl|uk)(\/budgets\/new)?\/?$/, {
    timeout: 10000,
  });
});
