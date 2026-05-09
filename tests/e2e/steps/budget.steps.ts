/**
 * budget.steps.ts — BDD step definitions for budget feature tests.
 * Tags: @phase2
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { AccountsPage } from "../pages/AccountsPage.js";
import { createFreshUser } from "../fixtures/freshUser.js";

const { Given, When, Then } = createBdd(test);

let accountsPage: AccountsPage;

Given(
  "I am signed in as a fresh user with workspace {string}",
  async ({ page, scenarioCtx }, _workspaceName: string) => {
    // Create fresh user and sign in (workspace created during onboarding)
    const user = await createFreshUser(page, "en");
    scenarioCtx.freshUser = user;
    // User is now signed in and on the post-verify redirect page
    accountsPage = new AccountsPage(page);
  },
);

When("I open the Accounts page", async ({ page }) => {
  accountsPage = accountsPage ?? new AccountsPage(page);
  await accountsPage.goto("en");
});

When("I click {string}", async ({ page }, label: string) => {
  await page.getByRole("button", { name: new RegExp(label, "i") }).first().click();
});

When(
  "I fill the account form with name {string}, kind {string}, scope {string}, currency {string}",
  async ({ page }, name: string, kind: string, scope: string, currency: string) => {
    const accPage = new AccountsPage(page);
    await accPage.fillAccountName(name);
    // Kind is default CASH or can be selected via select
    // Scope button
    await page.getByRole("tab", { name: new RegExp(scope, "i") }).click();
    // Currency picker
    await accPage.currencyTrigger().click();
    await page
      .getByRole("option", { name: new RegExp(currency, "i") })
      .first()
      .click();
  },
);

When("I save the account", async ({ page }) => {
  const accPage = new AccountsPage(page);
  await accPage.saveAccount();
});

Then(
  "I see {string} in the Accounts list under {string}",
  async ({ page }, accountName: string, group: string) => {
    await expect(
      page.locator("section").filter({ hasText: group }).getByText(accountName),
    ).toBeVisible({ timeout: 10000 });
  },
);

When("I archive {string}", async ({ page }, accountName: string) => {
  const archiveBtn = page.getByRole("button", {
    name: new RegExp(`archive ${accountName}`, "i"),
  });
  await archiveBtn.click();
});

Then("{string} no longer appears in the active list", async ({ page }, accountName: string) => {
  // Wait for the page to reload / account to disappear
  await expect(page.getByText(accountName)).not.toBeVisible({ timeout: 10000 });
});
