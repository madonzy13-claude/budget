import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { PossessionsPo } from "../page-objects/PossessionsPo";

const { When, Then } = createBdd(test);

When("I open the wallets tab for possessions", async ({ page, freshUser }) => {
  await page.goto(`/en/budgets/${freshUser.budgetId}/wallets`);
  await page
    .waitForLoadState("networkidle", { timeout: 10000 })
    .catch(() => {});
});

Then("I see the possessions section", async ({ page }) => {
  await new PossessionsPo(page).section().waitFor({ state: "visible" });
});

When(
  "I add a possession {string} via the inline add row",
  async ({ page }, name: string) => {
    await new PossessionsPo(page).addPossession(name);
  },
);

Then(
  "the possession row {string} is visible",
  async ({ page }, name: string) => {
    await new PossessionsPo(page).row(name).waitFor({ state: "visible" });
  },
);

Then(
  "the possession row {string} persists after a reload",
  async ({ page }, name: string) => {
    await page.reload();
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
    await new PossessionsPo(page).row(name).waitFor({ state: "visible" });
  },
);
