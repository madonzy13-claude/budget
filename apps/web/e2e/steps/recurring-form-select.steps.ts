import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";

const { When, Then } = createBdd(test);

When("I open the add recurring rule form", async ({ page }) => {
  // Open the Recurring Expenses accordion, then the add-rule sheet.
  await page.getByRole("button", { name: /Recurring/i }).first().click();
  await page.getByRole("button", { name: /Add rule|Add payment|додати платіж/i }).click();
  await page.locator("#rr-category").waitFor({ state: "visible" });
});

When("I open the recurring category dropdown", async ({ page }) => {
  await page.locator("#rr-category").click();
  await expect(page.locator("#rr-category")).toHaveAttribute(
    "data-state",
    "open",
  );
});

When("I click the recurring category dropdown again", async ({ page }) => {
  // On the buggy build the Dialog overlay intercepts this click (it times out);
  // with the fix the trigger is interactive and this closes the Select.
  await page.locator("#rr-category").click({ timeout: 5000 });
});

Then("the recurring category dropdown is closed", async ({ page }) => {
  await expect(page.locator("#rr-category")).toHaveAttribute(
    "data-state",
    "closed",
  );
});
