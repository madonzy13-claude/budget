import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";

const { When, Then } = createBdd(test);

When("I open the add scheduled rule form", async ({ page }) => {
  // Open the Scheduled Expenses accordion, then the add-rule sheet.
  await page
    .getByRole("button", { name: /Scheduled/i })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Add rule|Add payment|додати платіж/i })
    .click();
  await page.locator("#rr-category").waitFor({ state: "visible" });
});

When("I open the scheduled category dropdown", async ({ page }) => {
  await page.locator("#rr-category").click();
  await expect(page.locator("#rr-category")).toHaveAttribute(
    "data-state",
    "open",
  );
});

When("I click the scheduled category dropdown again", async ({ page }) => {
  // On the buggy build the Dialog overlay intercepts this click (it times out);
  // with the fix the trigger is interactive and this closes the Select.
  await page.locator("#rr-category").click({ timeout: 5000 });
});

Then("the scheduled category dropdown is closed", async ({ page }) => {
  await expect(page.locator("#rr-category")).toHaveAttribute(
    "data-state",
    "closed",
  );
});

// ───────────────────────────────────────────────────────────────────────────
// First due date: today is allowed, the past is not (user, 260921)
// ───────────────────────────────────────────────────────────────────────────

/** Offsets are in days from today; 0 IS today, which must stay allowed. */
When(
  /^I set the scheduled first due date (\d+) days? (before|after) today$/,
  async ({ page }, nStr: string, dir: string) => {
    const n = parseInt(nStr, 10) * (dir === "before" ? -1 : 1);
    const iso = new Date(Date.now() + n * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.locator("#rr-firstdue").fill(iso);
  },
);

When("I set the scheduled first due date to today", async ({ page }) => {
  await page
    .locator("#rr-firstdue")
    .fill(new Date().toISOString().slice(0, 10));
});

Then("the scheduled form rejects the first due date", async ({ page }) => {
  await expect(page.getByTestId("rr-firstdue-error")).toBeVisible();
  // The message alone is not enough — the save must actually be barred.
  await expect(
    page.getByRole("button", { name: /Save rule|Save/i }).last(),
  ).toBeDisabled();
});

Then("the scheduled form accepts the first due date", async ({ page }) => {
  await expect(page.getByTestId("rr-firstdue-error")).toHaveCount(0);
});
