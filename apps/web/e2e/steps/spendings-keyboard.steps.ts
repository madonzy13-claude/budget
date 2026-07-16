/**
 * spendings-keyboard.steps.ts — r40 desktop keyboard navigation over the grid.
 * Tab cycles quick-add inputs, arrows walk a column's rows, Enter opens the
 * inline amount editor, Backspace opens the delete confirmation.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";

const { When, Then } = createBdd(test);

When(/^I focus the "(.+?)" quick input$/, async ({ page }, name: string) => {
  await page.getByTestId(`quick-entry-${name.toLowerCase()}`).click();
});

When(/^I press "(.+?)" in the grid$/, async ({ page }, combo: string) => {
  await page.keyboard.press(combo);
});

Then(/^the "(.+?)" quick input is focused$/, async ({ page }, name: string) => {
  await expect(page.getByTestId(`quick-entry-${name}`)).toBeFocused();
});

Then("a transaction row is focused", async ({ page }) => {
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
    )
    .toMatch(/^txn-row-/);
});

Then("the row amount editor is open", async ({ page }) => {
  await expect(
    page.locator('[data-testid^="txn-row-"] input').first(),
  ).toBeVisible({ timeout: 5000 });
});

Then("the delete confirmation dialog is visible", async ({ page }) => {
  await expect(page.getByTestId("txn-row-delete-confirm")).toBeVisible({
    timeout: 5000,
  });
});
