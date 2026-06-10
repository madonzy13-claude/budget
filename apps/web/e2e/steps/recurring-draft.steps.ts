import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { When, Then } = createBdd(test);

// ─── Draft row assertions ────────────────────────────────────────────────────
// NOTE: "CONFIRM_DRAFT" task seeding reuses the Given step already defined in
// tasks.steps.ts. Navigation reuses When steps from tasks.steps.ts.

Then(
  /^the draft row for rule "(.+?)" is visible$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    await expect(spendings.draftRow(ruleName)).toBeVisible({ timeout: 8000 });
  },
);

Then("the draft confirm button is visible", async ({ page }) => {
  const spendings = new SpendingsPo(page);
  await expect(spendings.draftConfirmButton()).toBeVisible({ timeout: 5000 });
});

When(
  /^I confirm the draft for rule "(.+?)"$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    // First ensure the draft row is visible before clicking confirm.
    await expect(spendings.draftRow(ruleName)).toBeVisible({ timeout: 8000 });
    await spendings.draftConfirmButton().click();
  },
);

Then(
  /^the draft row for rule "(.+?)" is not visible$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    await expect(spendings.draftRow(ruleName)).toBeHidden({ timeout: 8000 });
  },
);
