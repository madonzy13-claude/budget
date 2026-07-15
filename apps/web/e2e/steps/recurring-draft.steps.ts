import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import {
  createRecurringRuleViaHttp,
  createCategoryViaHttp,
} from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { Given, When, Then } = createBdd(test);

// ─── Seed a real recurring rule so useDrafts returns a pending draft row ─────

Given(
  /^a recurring rule "(.+?)" is due this month in budget "(.+?)"$/,
  async (
    { context, baseURL, freshUser },
    ruleName: string,
    _budgetName: string,
  ) => {
    const baseUrl =
      baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const firstDueDate = `${yyyy}-${mm}-${dd}`;
    const cadenceAnchor = today.getDate();
    // The grid renders drafts grouped by category; a null-category draft is
    // dropped. Create a real category first and attach the rule to it.
    const categoryId = await createCategoryViaHttp(
      baseUrl,
      cookieHeader,
      freshUser.budgetId,
      "Housing",
    );
    await createRecurringRuleViaHttp(
      baseUrl,
      cookieHeader,
      freshUser.budgetId,
      {
        note: ruleName,
        amount: "1000.00",
        currency: "USD",
        firstDueDate,
        cadenceAnchor,
        categoryId,
      },
    );
  },
);

// ─── Draft row assertions ────────────────────────────────────────────────────

Then(
  /^the draft row for rule "(.+?)" is visible$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    await expect(spendings.draftRow(ruleName)).toBeVisible({ timeout: 8000 });
  },
);

Then("the draft confirm button is visible", async ({ page }) => {
  const spendings = new SpendingsPo(page);
  // Row actions are hidden until revealed. Hover only works above the `sm`
  // breakpoint (sm:group-hover); the mobile project must use tap-reveal, so
  // click the row — it sets `revealed` on every viewport.
  await page.locator('[data-testid^="draft-row-"]').first().click();
  await expect(spendings.draftConfirmButton()).toBeVisible({ timeout: 5000 });
});

When(
  /^I confirm the draft for rule "(.+?)"$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    const row = spendings.draftRow(ruleName);
    await expect(row).toBeVisible({ timeout: 8000 });
    // Reveal the action buttons via tap-reveal (works on all viewports;
    // hover-reveal only exists above the `sm` breakpoint).
    await row.click();
    // Wait for the revealed confirm button before clicking — under CI load the
    // reveal + button mount can lag, and clicking a not-yet-actionable button
    // silently no-ops, leaving the draft in place (flaky "still visible").
    const confirmBtn = spendings.draftConfirmButton();
    await expect(confirmBtn).toBeVisible({ timeout: 8000 });
    await confirmBtn.click();
  },
);

Then(
  /^the draft row for rule "(.+?)" is not visible$/,
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPo(page);
    // Generous timeout: the confirm mutation + query invalidation + re-render
    // can take several seconds on a contended CI runner.
    await expect(spendings.draftRow(ruleName)).toBeHidden({ timeout: 15000 });
  },
);
