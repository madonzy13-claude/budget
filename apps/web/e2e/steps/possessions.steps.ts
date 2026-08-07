import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { WalletSectionsPo } from "../page-objects/WalletSectionsPo";

const { When, Then } = createBdd(test);

When(
  "I open the wallets tab for wallet sections",
  async ({ page, freshUser }) => {
    await page.goto(`/en/budgets/${freshUser.budgetId}/wallets`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

Then("I see the {string} wallet section", async ({ page }, type: string) => {
  await expect(new WalletSectionsPo(page).section(type)).toBeVisible();
});

When(
  "I add a wallet {string} to the {string} section",
  async ({ page }, name: string, type: string) => {
    await new WalletSectionsPo(page).addWallet(type, name);
  },
);

When(
  "I move the wallet {string} to the {string} section",
  async ({ page }, name: string, type: string) => {
    await new WalletSectionsPo(page).moveWallet(name, type);
  },
);

Then(
  "the wallet {string} is in the {string} section",
  async ({ page }, name: string, type: string) => {
    await expect(new WalletSectionsPo(page).row(type, name)).toBeVisible();
  },
);

Then(
  "the wallet {string} is still in the {string} section after a reload",
  async ({ page }, name: string, type: string) => {
    await page.reload();
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await expect(new WalletSectionsPo(page).row(type, name)).toBeVisible();
  },
);
