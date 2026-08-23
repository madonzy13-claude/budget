import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import {
  createScheduledPaymentViaHttp,
  createCategoryViaHttp,
} from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { Given, When, Then } = createBdd(test);

// ─── Seed a real scheduled rule so useDrafts returns a pending draft row ─────

Given(
  /^a scheduled rule "(.+?)" is due this month in budget "(.+?)"$/,
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
    await createScheduledPaymentViaHttp(
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
    const confirmBtn = spendings.draftConfirmButton();
    // The reveal tap can land on the CONFIRM BUTTON itself. When the actions
    // are already showing — which they are once the runner is slow enough for a
    // re-render to sit between the row mounting and this click — that click
    // confirms the draft outright, and the button unmounts with it. Waiting for
    // it to come back then burns the entire 60s test timeout: it failed 8/8
    // across two CI runs while passing locally, and the trace showed no draft
    // row and a real "Rent" expense already in the grid (260823).
    //
    // So: confirm it if it is still there, and otherwise prove it went. Either
    // way the draft ends up confirmed, which is what the scenario is about.
    if (await confirmBtn.isVisible().catch(() => false)) {
      // dispatchEvent('click') instead of .click(): confirming fires
      // useConfirmDraft, which removes the draft and UNMOUNTS this row.
      // Playwright's normal .click() re-checks actionability and sees the
      // element detach mid-gesture, then retries until the test timeout. A
      // dispatched click fires the React onClick directly, with no
      // hover/stability dance to lose the element to.
      await confirmBtn.dispatchEvent("click");
    } else {
      await expect(row).toBeHidden({ timeout: 8000 });
    }
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
