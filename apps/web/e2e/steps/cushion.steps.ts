import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SettingsPo } from "../page-objects/SettingsPo";
import { WalletsPo } from "../page-objects/WalletsPo";

const { When, Then } = createBdd(test);

// ─── Settings navigation ─────────────────────────────────────────────────────

When(
  /^I open the settings tab for "(.+?)"$/,
  async ({ page, freshUser }, name: string) => {
    if (freshUser.budgetName !== name)
      throw new Error(`Unknown budget '${name}'`);
    await page.goto(`/en/budgets/${freshUser.budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

// ─── Cushion settings ────────────────────────────────────────────────────────

When("I open the cushion settings section", async ({ page }) => {
  const settings = new SettingsPo(page);
  await settings.openCushionSection();
});

When(
  /^I set the cushion target months to (\d+)$/,
  async ({ page }, months: string) => {
    const settings = new SettingsPo(page);
    await settings.changeCushionTargetMonths(Number(months));
  },
);

Then(
  /^the cushion target months input shows (\d+)$/,
  async ({ page }, months: string) => {
    const settings = new SettingsPo(page);
    await expect(settings.cushionTargetMonthsInput()).toHaveValue(
      String(months),
      { timeout: 5000 },
    );
  },
);

// ─── Wallets cushion section ─────────────────────────────────────────────────

Then("the cushion wallet section is visible", async ({ page }) => {
  const wallets = new WalletsPo(page);
  await expect(wallets.cushionSection()).toBeVisible({ timeout: 8000 });
});
