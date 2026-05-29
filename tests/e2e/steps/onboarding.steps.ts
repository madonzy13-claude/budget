/**
 * onboarding.steps.ts — BDD step definitions for the 4-step deferred-create
 * onboarding wizard. Tags: @phase6.
 *
 * "I am a fresh user with no prior budget" creates a verified user WITHOUT
 * a budget — the layout guard then redirects them to /budgets/new on the
 * next navigation.
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
    const user = await createFreshUser(page, "en");
    scenarioCtx.freshUser = user;
  },
);

// ── When steps ─────────────────────────────────────────────────────────────────

When("I navigate to the onboarding wizard", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.open("en");
  // Let the layout guard redirect settle.
  await page.waitForLoadState("networkidle");
});

When("I click Get started", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.clickGetStarted();
});

When("I fill in the budget name {string}", async ({ page }, name: string) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.fillName(name);
});

When("I pick the currency {string}", async ({ page }, code: string) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.pickCurrency(code);
});

When("I pick the budget type {string}", async ({ page }, type: string) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.pickType(type as "personal" | "shared");
});

When(/^I toggle the cushion feature (on|off)$/, async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.toggleCushion();
});

When(/^I toggle the reserves feature (on|off)$/, async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.toggleReserves();
});

When("I click Next", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.clickNext();
});

When("I click Create budget", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await onboarding.clickCreate();
});

// "I reload the page" — provided by workspace.steps.ts; do not redefine.

// ── Then steps ─────────────────────────────────────────────────────────────────

Then("I see the review step", async ({ page }) => {
  const onboarding = new OnboardingPage(page);
  await expect(onboarding.createButton()).toBeVisible({ timeout: 15000 });
});

Then(
  "the review shows budget name {string}",
  async ({ page }, expected: string) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.reviewName()).toContainText(expected);
  },
);

Then(
  "the review shows cushion as {string}",
  async ({ page }, state: string) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.reviewCushion()).toContainText(state);
  },
);

Then(
  "the review shows reserves as {string}",
  async ({ page }, state: string) => {
    const onboarding = new OnboardingPage(page);
    await expect(onboarding.reviewReserves()).toContainText(state);
  },
);

Then("I land on the budget spendings page", async ({ page }) => {
  await expect(page).toHaveURL(/\/budgets\/[0-9a-f-]+\/spendings/, {
    timeout: 20000,
  });
});

Then("the wizard is on the welcome step", async ({ page }) => {
  // Deferred-create means a mid-wizard reload restarts from step 0.
  // The welcome screen exposes the "Get started" CTA.
  const onboarding = new OnboardingPage(page);
  await expect(onboarding.getStartedButton()).toBeVisible({ timeout: 15000 });
});
