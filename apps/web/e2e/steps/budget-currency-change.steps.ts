import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SettingsPo } from "../page-objects/SettingsPo";

const { When, Then } = createBdd(test);

When("I change the budget currency to {string}", async ({ page }, ccy: string) => {
  const settings = new SettingsPo(page);
  await settings.pickCurrency(ccy);
  await settings.confirmCurrencyDialog();
  await settings.assertCurrency(ccy);
});

When("I pick {string} as the budget currency and cancel", async ({ page }, ccy: string) => {
  const settings = new SettingsPo(page);
  await settings.pickCurrency(ccy);
  await settings.cancelCurrencyDialog();
});

Then("the budget currency reads {string}", async ({ page }, ccy: string) => {
  await new SettingsPo(page).assertCurrency(ccy);
});

When("I reload the spendings page", async ({ page }) => {
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
});
