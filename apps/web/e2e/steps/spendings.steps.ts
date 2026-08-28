import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { When, Then } = createBdd(test);

// ─── Navigation ─────────────────────────────────────────────────────────────

When(
  /^I open the spendings tab for the budget$/,
  async ({ page, freshUser }) => {
    await page.goto(`/en/budgets/${freshUser.budgetId}/spendings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

// ─── Quick-entry ─────────────────────────────────────────────────────────────

When(
  /^I type a quick-entry of "(\d+)" cents into the "(.+?)" column$/,
  async ({ page }, amountCents: string, categoryName: string) => {
    const spendings = new SpendingsPo(page);
    // The amount field accepts major-unit decimals (e.g. "5.00" for 500 cents).
    const majorUnits = (Number(amountCents) / 100).toFixed(2);
    await spendings.typeQuickEntry(categoryName, majorUnits);
  },
);

Then(
  /^a confirmed transaction row for (\d+) cents is visible in the grid$/,
  async ({ page }, amountCents: string) => {
    const spendings = new SpendingsPo(page);
    await expect(
      spendings.transactionRowByAmount(Number(amountCents)),
    ).toBeVisible({ timeout: 8000 });
  },
);

Then(
  /^no confirmed transaction row for (\d+) cents is visible in the grid$/,
  async ({ page }, amountCents: string) => {
    const spendings = new SpendingsPo(page);
    await expect(
      spendings.transactionRowByAmount(Number(amountCents)),
    ).toHaveCount(0);
  },
);

// ─── Reserve auto-deduct (ROADMAP criterion #4) ──────────────────────────────

Then(
  /^the reserves-used indicator for "(.+?)" is visible in the column header$/,
  async ({ page }, categoryName: string) => {
    const spendings = new SpendingsPo(page);
    await expect(spendings.columnReservesUsed(categoryName)).toBeVisible({
      timeout: 8000,
    });
  },
);

// ─── ReservesPo steps reused in the @phase8 auto-deduct scenario ─────────────
// (The reserves.feature auto-deduct scenario uses "I open the spendings tab for
//  the budget" defined above, plus the column-header assertion above.
//  The existing reserves.steps.ts handles the Given seed steps.)
