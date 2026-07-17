/**
 * spendings-keyboard.steps.ts — r40b desktop keyboard navigation over the grid.
 * Arrows walk a column's rows AND hop columns (Left/Right on a row → same index
 * in the neighbour). A quick input's Left/Right move the caret until the edge,
 * then save + hop to the neighbouring column's quick input. Enter opens the
 * inline amount editor / saves a quick entry; Backspace opens delete-confirm.
 * Focus (arrow-nav) reveals a row's action chips.
 */
import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";

const { When, Then } = createBdd(test);

When(
  /^I switch to the spendings tab by clicking its pill$/,
  async ({ page, freshUser }) => {
    // Land on a DIFFERENT tab first so the pill click is a real tab switch.
    await page.goto(`/en/budgets/${freshUser.budgetId}/overview`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    const pill = page.getByTestId("bdp-tab-spendings");
    await pill.click();
    // The bug: focus STAYS on the pill after the click; arrows were dead until a
    // page click moved focus off it. Wait for the grid to mount WITHOUT touching
    // it, and assert the pill still owns focus so the next arrow tests the fix.
    await page
      .getByTestId("quick-entry-groceries")
      .waitFor({ state: "attached", timeout: 10000 });
    await expect(pill).toBeFocused();
  },
);

When(/^I focus the "(.+?)" quick input$/, async ({ page }, name: string) => {
  await page.getByTestId(`quick-entry-${name.toLowerCase()}`).click();
});

When(/^I press "(.+?)" in the grid$/, async ({ page }, combo: string) => {
  await page.keyboard.press(combo);
});

When(
  /^I type "(.+?)" into the focused quick input$/,
  async ({ page }, text: string) => {
    await page.keyboard.type(text);
  },
);

When(
  /^I type the letters "(.+?)" in the grid$/,
  async ({ page }, letters: string) => {
    for (const ch of letters) await page.keyboard.press(ch);
  },
);

Then("the focused row shows its action chips", async ({ page }) => {
  // Chips render only for the hovered/focused row, so a single set is visible.
  await expect(page.getByTestId("txn-action-edit").first()).toBeVisible({
    timeout: 5000,
  });
});

Then(
  /^the "(.+?)" column has the focused row$/,
  async ({ page }, name: string) => {
    await expect
      .poll(() =>
        page.evaluate((catName) => {
          const active = document.activeElement;
          const col = active?.closest<HTMLElement>(
            '[data-testid^="category-column-"]',
          );
          if (!col) return false;
          return !!col.querySelector(
            `[data-testid="column-header-${catName.toLowerCase()}"]`,
          );
        }, name),
      )
      .toBe(true);
  },
);

Then(/^the "(.+?)" quick input is focused$/, async ({ page }, name: string) => {
  await expect(page.getByTestId(`quick-entry-${name}`)).toBeFocused();
});

Then("a transaction row is focused", async ({ page }) => {
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
    )
    .toMatch(/^txn-row-/);
});

Then("the row amount editor is open", async ({ page }) => {
  await expect(
    page.locator('[data-testid^="txn-row-"] input').first(),
  ).toBeVisible({ timeout: 5000 });
});

When("I confirm the delete", async ({ page }) => {
  await page.getByTestId("txn-row-delete-confirm").click();
});

Then("the delete confirmation dialog is visible", async ({ page }) => {
  await expect(page.getByTestId("txn-row-delete-confirm")).toBeVisible({
    timeout: 5000,
  });
});
