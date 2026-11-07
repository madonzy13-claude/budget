import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SettingsPo } from "../page-objects/SettingsPo";
import { InvestmentsPo } from "../page-objects/InvestmentsPo";
import { SpendingsPo } from "../page-objects/SpendingsPo";
const { When, Then } = createBdd(test);

When(
  "I open the Investments section of budget Settings",
  async ({ page, freshUser }) => {
    await page.goto(`/en/budgets/${freshUser.budgetId}/settings`);
    await new SettingsPo(page).openInvestmentsSection();
  },
);

Then("it offers only the Investments on\\/off switch", async ({ page }) => {
  const po = new SettingsPo(page);
  await expect(po.investmentsToggle()).toBeVisible();
  await expect(po.investmentsSection().getByRole("switch")).toHaveCount(1);
});

When("I turn Investments on", async ({ page }) => {
  const toggle = new SettingsPo(page).investmentsToggle();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true", { timeout: 10000 });
});

Then("the Investments section is on my Wallets tab", async ({ page, freshUser }) => {
  await page.goto(`/en/budgets/${freshUser.budgetId}/wallets`);
  await expect(new InvestmentsPo(page).section()).toBeVisible({ timeout: 20000 });
});

Then(
  "my Spendings have no {string} column",
  async ({ page, freshUser }, name: string) => {
    await page.goto(`/en/budgets/${freshUser.budgetId}/spendings`);
    const po = new SpendingsPo(page);
    await po.grid().waitFor({ state: "visible", timeout: 20000 });
    await expect(po.columnHeader(name)).toHaveCount(0);
  },
);
