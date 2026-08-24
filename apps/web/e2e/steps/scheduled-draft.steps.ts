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
    const confirmBtn = spendings.draftConfirmButton();
    // Do NOT tap the row when the actions are already showing.
    //
    // The tap exists to reveal them (hover-reveal only exists above `sm`). But
    // the confirm button lives INSIDE the row, so once the actions are already
    // out — which they are on a slower runner, where a re-render lands between
    // the row mounting and this step — the reveal tap hits confirm itself. The
    // draft is then confirmed and the button unmounted before anything can be
    // dispatched to it, and the wait burns the full 60s test timeout: 8/8
    // across two CI runs, then 4/4 again on main (260823-24).
    //
    // A previous attempt guarded only the DISPATCH, which cannot work: the row
    // tap had already fired, and `isVisible()` is a point-in-time answer that
    // goes stale the moment the mutation lands. The tap itself is what has to
    // be conditional.
    if (!(await confirmBtn.isVisible().catch(() => false))) {
      await row.click();
      await expect(confirmBtn).toBeVisible({ timeout: 8000 });
    }
    // dispatchEvent('click') instead of .click(): confirming fires
    // useConfirmDraft, which removes the draft and UNMOUNTS this row.
    // Playwright's normal .click() re-checks actionability and sees the element
    // detach mid-gesture, then retries until the test timeout. A dispatched
    // click fires the React onClick directly, with no hover/stability dance to
    // lose the element to.
    //
    // Still tolerated: the button may have gone anyway, because a tap we did
    // fire is settling. The outcome is asserted below either way.
    await confirmBtn.dispatchEvent("click").catch(() => {});
    await expect(row).toBeHidden({ timeout: 10000 });
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
