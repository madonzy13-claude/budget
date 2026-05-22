/**
 * onboarding.steps.ts — BDD step definitions for Phase 6 onboarding wizard.
 * Tags: @phase6
 *
 * "I am a fresh user with no prior budget" creates a verified user WITHOUT
 * calling POST /api/budgets — the wizard guards against that. The layout
 * guard sees incomplete onboarding_progress and redirects to /budgets/new.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { OnboardingPage } from "../pages/OnboardingPage.js";
import { createFreshUser } from "../fixtures/freshUser.js";

const { Given, When, Then } = createBdd(test);

// ── Given steps ────────────────────────────────────────────────────────────────

Given(
  "I am a fresh user with no prior budget",
  async ({ page, scenarioCtx }) => {
    // createFreshUser creates a verified user but does NOT create a budget.
    // The layout guard will redirect them to /budgets/new on first navigation.
    const user = await createFreshUser(page, "en");
    scenarioCtx.freshUser = user;
  },
);

// ── When steps ─────────────────────────────────────────────────────────────────

When("I navigate to the onboarding wizard", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.open("en");
  // Allow the layout guard redirect to settle
  await page.waitForLoadState("networkidle");
});

When(
  "I fill in the budget name {string}",
  async ({ page }, name: string) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.fillName(name);
  },
);

When(
  "I pick the currency {string}",
  async ({ page }, code: string) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.pickCurrency(code);
  },
);

When(
  "I pick the budget type {string}",
  async ({ page }, type: string) => {
    const onboarding = new OnboardingPage(page);
    await onboarding.pickType(type as "personal" | "shared");
  },
);

When("I toggle at least one starter category", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  // Click the first category item visible in the list
  const first = onboarding.categoryItem(/.+/);
  await first.first().click();
});

When("I click Next", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.clickNext();
});

When("I click Create budget", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.clickCreate();
});

// ── Then steps ─────────────────────────────────────────────────────────────────

Then("I see the review step", async ({ page }) => {
  // Step 5 review content — either the stepper shows step 5 or the
  // Create budget button appears (only present on review step)
  const onboarding = new OnboardingPage(page);
  await expect(onboarding.createButton()).toBeVisible({ timeout: 15000 });
});

Then("I land on the budget spendings page", async ({ page }) => {
  await expect(page).toHaveURL(/\/budgets\/[0-9a-f-]+\/spendings/, {
    timeout: 20000,
  });
});

Then("the wizard is still on step 2", async ({ page }) => {
  // After reload, wizard should resume at the saved step.
  // Step 2 shows the currency picker trigger.
  const onboarding = new OnboardingPage(page);
  await expect(onboarding.currencyTrigger()).toBeVisible({ timeout: 15000 });
});

Then("the spendings grid has at least one category row", async ({ page }) => {
  // Category rows have data-testid="category-row" (from Phase 4 grid)
  await expect(
    page.locator('[data-testid="category-row"]').first(),
  ).toBeVisible({ timeout: 15000 });
});
