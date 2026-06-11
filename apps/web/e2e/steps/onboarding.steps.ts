import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import {
  signUpViaHttp,
  parseSetCookieToPlaywright,
  type ParsedCookie,
} from "../fixtures/fresh-user-per-scenario";
import { OnboardingPo } from "../page-objects/OnboardingPo";

const { Given, When, Then } = createBdd(test);

// ─── Background fixture ───────────────────────────────────────────────────────

/**
 * Create a user with NO budget and do NOT mark onboarding complete.
 * The (app) layout detects completedAt=null and redirects to /budgets/new,
 * which renders the wizard (step 0 welcome since hasAnyBudget === false).
 *
 * Differs from "I am a signed-in user with no budgets" (common-steps.ts) which
 * calls PUT /api/onboarding/progress to mark completion — that would bypass the
 * wizard redirect.
 */
Given(
  "I am signed in as a new user with no existing budget",
  async ({ context, baseURL }) => {
    const baseUrl =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const email = `phase8-onboard-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@test.local`;
    const { setCookieHeaders } = await signUpViaHttp(
      baseUrl,
      email,
      "Test1234!Phase8",
      "Phase8 Onboarding",
    );
    const cookies = setCookieHeaders
      .map((l) => parseSetCookieToPlaywright(l, baseUrl))
      .filter((c): c is ParsedCookie => c !== null);
    if (cookies.length === 0) {
      throw new Error("onboarding fixture: signup produced no session cookies");
    }
    await context.addCookies(cookies);
    // Do NOT call PUT /api/onboarding/progress — the wizard must render.
  },
);

// ─── Navigation ───────────────────────────────────────────────────────────────

When("I open the onboarding wizard", async ({ page }) => {
  await page.goto("/en/budgets/new");
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

// ─── Wizard steps ─────────────────────────────────────────────────────────────

Then("the wizard stepper is visible", async ({ page }) => {
  const onboarding = new OnboardingPo(page);
  await expect(onboarding.stepper()).toBeVisible({ timeout: 8000 });
});

When(
  /^I advance through the wizard basics step with name "(.+?)"$/,
  async ({ page }, budgetName: string) => {
    const onboarding = new OnboardingPo(page);
    // Real step order: 0 Welcome, 1 Type, 2 Basics, 3 Features, 4 Push, 5 Review.
    await onboarding.clickNext(); // 0 Welcome ("Get started") → 1 Type
    await onboarding.clickNext(); // 1 Type (default PRIVATE) → 2 Basics
    const nameInput = page.getByTestId("wizard-step1-name");
    await nameInput.waitFor({ state: "visible", timeout: 8000 });
    await nameInput.fill(budgetName);
    await onboarding.clickNext(); // 2 Basics → 3 Features
  },
);

When("I advance past the optional wizard steps", async ({ page }) => {
  const onboarding = new OnboardingPo(page);
  // Now on Features (step 3); skip it to land on Push (step 4).
  // Do NOT skip Push — the caller asserts the push switch.
  await onboarding.clickSkip(); // skip Features (3) → 4 Push
});

When(
  "I advance past the optional wizard steps to the push step",
  async ({ page }) => {
    const onboarding = new OnboardingPo(page);
    // On Features (step 3); skip it to land on Push (step 4).
    await onboarding.clickSkip(); // skip Features (3) → 4 Push
  },
);

Then("the push opt-in switch is present on the push step", async ({ page }) => {
  const onboarding = new OnboardingPo(page);
  await expect(onboarding.pushStepSwitch()).toBeVisible({ timeout: 8000 });
});

When("I skip the push step", async ({ page }) => {
  const onboarding = new OnboardingPo(page);
  await onboarding.clickSkip();
});

When("I complete the wizard", async ({ page }) => {
  const onboarding = new OnboardingPo(page);
  // Called from either the Push step (needs Push→Review then Create) or the
  // Review step (after skipping Push). Advance until "Create budget" shows,
  // then click it.
  const createBtn = page.getByRole("button", { name: /create budget/i });
  for (let i = 0; i < 3; i++) {
    if (await createBtn.isVisible().catch(() => false)) break;
    await onboarding.clickNext();
  }
  await createBtn.click();
});

Then("I land on the new budget spendings page", async ({ page }) => {
  // After wizard completion the app navigates to /budgets/<id>/spendings.
  await page.waitForURL(/\/budgets\/[^/]+\/spendings/, { timeout: 15000 });
});
