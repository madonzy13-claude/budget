import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { SpendingsPo } from "../page-objects/SpendingsPo";

const { Given, When, Then } = createBdd(test);

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

// ─── Offline queue ───────────────────────────────────────────────────────────

When("the browser goes offline", async ({ context }) => {
  await context.setOffline(true);
});

When("the browser comes back online", async ({ context }) => {
  await context.setOffline(false);
});

Then(
  "a pending-sync marker is visible on the queued transaction",
  async ({ page }) => {
    const spendings = new SpendingsPo(page);
    await expect(spendings.anyPendingSyncMarker()).toBeVisible({
      timeout: 5000,
    });
  },
);

Then("the offline status badge is visible", async ({ page }) => {
  const spendings = new SpendingsPo(page);
  await expect(spendings.offlineStatusBadge()).toBeVisible({ timeout: 5000 });
});

Then("no pending-sync markers remain in the grid", async ({ page }) => {
  const spendings = new SpendingsPo(page);
  // After replay the marker should disappear within a reasonable timeout.
  await expect(spendings.anyPendingSyncMarker()).toHaveCount(0, {
    timeout: 10000,
  });
});

// ─── Sync-issues ─────────────────────────────────────────────────────────────

/**
 * Inject a sync-failure into the write queue by dispatching a custom DOM event
 * that the SyncIssuesList component listens for. This avoids needing a real
 * server error — the component renders the list whenever the queue reports a
 * failed item via the `sync-issue` custom event or the persisted queue state.
 *
 * If the component does not expose a DOM event injection path, the step seeds
 * the issues list via localStorage (the write-queue persists to IndexedDB/LS).
 */
Given("a sync-failure is injected into the write queue", async ({ page }) => {
  // Dispatch a synthetic failure event that the SyncIssuesList listens for.
  // This is a test-only hook; production code never calls this path.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("budget:sync-failure", {
        detail: {
          idempotencyKey: "e2e-test-failure-key",
          error: "E2E injected failure",
          amount: 999,
          categoryId: "e2e-cat",
        },
      }),
    );
  });
});

Then("the sync-issues list is visible", async ({ page }) => {
  const spendings = new SpendingsPo(page);
  await expect(spendings.syncIssuesList()).toBeVisible({ timeout: 5000 });
});

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
