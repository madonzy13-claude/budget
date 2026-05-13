/**
 * spendings.steps.ts — BDD step definitions for Phase 4 Spendings Grid features.
 * Tags: @phase4
 *
 * Note: "I am signed in as a fresh user with workspace {string}" Given step
 * is defined in budget.steps.ts and reused here automatically by playwright-bdd.
 * This file provides the Phase 4-specific When/Then steps.
 *
 * Plan 04-05 will expand these stubs into production-grade steps.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { SpendingsPage } from "../pages/SpendingsPage.js";

const { When, Then } = createBdd(test);

When(
  "I open the Spendings tab on a budget {string}",
  async ({ page }, _budgetName: string) => {
    // Minimal implementation: navigate to the active budget's spendings tab.
    // Plan 04-05 expands this with dynamic budget ID resolution.
    await page.goto("/en/budgets/active");
  },
);

Then("I see the spendings grid container", async ({ page }) => {
  const spendings = new SpendingsPage(page);
  await expect(spendings.gridContainer()).toBeVisible();
});
