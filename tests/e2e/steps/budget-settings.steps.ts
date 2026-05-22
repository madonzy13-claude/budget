/**
 * budget-settings.steps.ts — BDD step definitions for Phase 6 Budget Settings tab.
 * Tags: @phase6
 *
 * Requires: "I am signed in as a fresh user with workspace {string}" from budget.steps.ts.
 * Budget ID is stored in scenarioCtx.workspaceId by that step.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { BudgetSettingsPage } from "../pages/BudgetSettingsPage.js";

const { When, Then } = createBdd(test);

function getBudgetId(scenarioCtx: Record<string, unknown>): string {
  const id = scenarioCtx["workspaceId"] as string | undefined;
  if (!id)
    throw new Error(
      "workspaceId not in scenarioCtx — run 'I am signed in as a fresh user with workspace' first",
    );
  return id;
}

// ── When steps ─────────────────────────────────────────────────────────────────

When(
  "I open the Budget Settings page for my budget",
  async ({ page, scenarioCtx }) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
    const settings = new BudgetSettingsPage(page);
    await settings.open("en", budgetId);
  },
);

When("I reload the Budget Settings page", async ({ page, scenarioCtx }) => {
  const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
  const settings = new BudgetSettingsPage(page);
  await settings.open("en", budgetId);
});

When(
  "I open the Cushion Mode section",
  async ({ page }) => {
    const settings = new BudgetSettingsPage(page);
    await settings.openSection(/cushion/i);
  },
);

When(
  "I open the Members section",
  async ({ page }) => {
    const settings = new BudgetSettingsPage(page);
    await settings.openSection(/members/i);
  },
);

When(
  "I open the Danger Zone section",
  async ({ page }) => {
    const settings = new BudgetSettingsPage(page);
    await settings.openSection(/danger/i);
  },
);

When(
  "I rename the budget to {string}",
  async ({ page }, newName: string) => {
    const settings = new BudgetSettingsPage(page);
    await settings.renameBudget(newName);
  },
);

When("I toggle the cushion switch", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await settings.toggleCushion();
});

When("I archive the budget", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await settings.archiveBudget();
});

When("I open the delete budget dialog", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await settings.deleteButton().click();
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 10000 });
});

When(
  "I type the budget name {string} in the confirm input",
  async ({ page }, budgetName: string) => {
    const settings = new BudgetSettingsPage(page);
    await settings.deleteNameInput().fill(budgetName);
  },
);

When("I confirm the budget deletion", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await settings.deleteForeverButton().click();
  await page.waitForLoadState("networkidle");
});

// ── Then steps ─────────────────────────────────────────────────────────────────

Then(
  "I see a toast matching {string}",
  async ({ page }, patternStr: string) => {
    const pattern = new RegExp(patternStr, "i");
    const toast = page.locator("[data-sonner-toast]", { hasText: pattern });
    await expect(toast).toBeVisible({ timeout: 10000 });
  },
);

Then(
  "the budget name input shows {string}",
  async ({ page }, expectedName: string) => {
    const settings = new BudgetSettingsPage(page);
    await expect(settings.identityInput()).toHaveValue(expectedName, {
      timeout: 10000,
    });
  },
);

Then("the cushion switch is checked", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await expect(settings.cushionSwitch()).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 10000 },
  );
});

Then("the share URL field is visible", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await expect(settings.shareUrlField()).toBeVisible({ timeout: 10000 });
});

Then("the copy link button is visible", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await expect(settings.copyLinkButton()).toBeVisible({ timeout: 10000 });
});

Then("I am on the home page", async ({ page }) => {
  await expect(page).toHaveURL(/\/(en|pl|uk)\/?$/, { timeout: 15000 });
});

Then(
  "the budget {string} is not visible in the home grid",
  async ({ page }, budgetName: string) => {
    await expect(
      page.getByRole("link", { name: new RegExp(budgetName, "i") }),
    ).toHaveCount(0, { timeout: 10000 });
  },
);

Then("the Delete forever button is disabled", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await expect(settings.deleteForeverButton()).toBeDisabled({ timeout: 5000 });
});

Then("the Delete forever button is enabled", async ({ page }) => {
  const settings = new BudgetSettingsPage(page);
  await expect(settings.deleteForeverButton()).toBeEnabled({ timeout: 5000 });
});

Then("the Members accordion section is not visible", async ({ page }) => {
  // PRIVATE budgets don't render the Members accordion trigger at all
  await expect(
    page.getByRole("button", { name: /^members$/i }),
  ).toHaveCount(0, { timeout: 10000 });
});
