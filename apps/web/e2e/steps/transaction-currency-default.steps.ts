import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { Given, When, Then } = createBdd(test);

/** Phase 14: a category in its own currency + a limit, through the real API. */
Given(
  /^a "([A-Z]{3})" category "(.+?)" with a ([\d.]+) limit exists in my budget$/,
  async ({ freshUser }, currency: string, name: string, limit: string) => {
    const { baseUrl, cookieHeader, budgetId } = freshUser;
    const headers = {
      "content-type": "application/json",
      cookie: cookieHeader,
      Origin: baseUrl,
      "X-Budget-ID": budgetId,
    };
    const res = await fetch(`${baseUrl}/api/budgets/${budgetId}/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, currency }),
    });
    if (!res.ok) throw new Error(`create category failed (${res.status}): ${await res.text()}`);
    const { category } = (await res.json()) as { category: { id: string } };
    const cents = String(Math.round(Number(limit) * 100));
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const lim = await fetch(`${baseUrl}/api/budgets/${budgetId}/categories/${category.id}/limits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ normalAmount: cents, cushionAmount: cents, effectiveFrom: monthStart }),
    });
    if (!lim.ok) throw new Error(`set limit failed (${lim.status}): ${await lim.text()}`);
  },
);

When(/^I quick-enter "([\d.]+)" in the "(.+?)" column$/, async ({ page }, amount: string, category: string) => {
  await new SpendingsPo(page).quickEnterAndWait(category, amount);
});

Then(/^the newest "(.+?)" spending reads in "(.+?)"$/, async ({ page }, category: string, sign: string) => {
  await new SpendingsPo(page).assertNewestRowCurrency(category, sign);
});

Then(
  /^the "(.+?)" limit reads in "(.+?)"$/,
  async ({ page }, category: string, sign: string) => {
    await new SpendingsPo(page).assertForeignLimit(category, sign);
  },
);
