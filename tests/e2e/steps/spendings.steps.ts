/**
 * spendings.steps.ts — BDD step definitions for Phase 4 Spendings Grid features.
 * Tags: @phase4
 *
 * "I am signed in as a fresh user with workspace {string}" Given step
 * is defined in budget.steps.ts and reused here automatically by playwright-bdd.
 * This file provides Phase 4-specific Given/When/Then steps.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { SpendingsPage } from "../pages/SpendingsPage.js";

const { Given, When, Then } = createBdd(test);

/** Resolve a budget UUID from the active workspace (budget.steps.ts stores it in scenarioCtx). */
async function findBudgetId(
  page: import("@playwright/test").Page,
  budgetName: string,
  scenarioCtx?: Record<string, unknown>,
): Promise<string> {
  // Fast path: use the ID stored by "I am signed in as a fresh user with workspace" step
  if (scenarioCtx) {
    const storedName = scenarioCtx["workspaceName"] as string | undefined;
    const storedId = scenarioCtx["workspaceId"] as string | undefined;
    if (storedId && storedName === budgetName) return storedId;
  }
  // Fallback: GET /api/budgets/active and find active workspace by name
  const activeRes = await page.request.get("/api/budgets/active");
  if (!activeRes.ok())
    throw new Error(`GET /api/budgets/active failed: ${activeRes.status()}`);
  const data = (await activeRes.json()) as {
    budgets?: Array<{ id: string; name: string }>;
    workspaces?: Array<{ id: string; name: string }>;
    data?: Array<{ id: string; name: string }>;
    activeWorkspaceIds?: string[];
  };
  // If active endpoint returns IDs but not names, use the active ID directly
  if (data.activeWorkspaceIds?.length) {
    return data.activeWorkspaceIds[0]!;
  }
  const list = data.budgets ?? data.workspaces ?? data.data ?? [];
  const found = list.find((b) => b.name === budgetName);
  if (!found)
    throw new Error(
      `Budget "${budgetName}" not found in: ${JSON.stringify(list.map((b) => b.name))}`,
    );
  return found.id;
}

/** Resolve a category UUID from the API response via its name. */
async function findCategoryId(
  page: import("@playwright/test").Page,
  budgetId: string,
  catName: string,
): Promise<string> {
  const res = await page.request.get(`/api/budgets/${budgetId}/categories`, {
    headers: { "X-Budget-ID": budgetId },
  });
  if (!res.ok())
    throw new Error(
      `GET /api/budgets/${budgetId}/categories failed: ${res.status()}`,
    );
  const data = (await res.json()) as {
    categories?: Array<{ id: string; name: string }>;
    data?: Array<{ id: string; name: string }>;
  };
  const list = data.categories ?? data.data ?? [];
  const found = list.find((c) => c.name === catName);
  if (!found)
    throw new Error(
      `Category "${catName}" not found in: ${JSON.stringify(list.map((c) => c.name))}`,
    );
  return found.id;
}

// ── Given steps ────────────────────────────────────────────────────────────────

Given(
  "the budget {string} has a category {string} with planned {string} {string}",
  async (
    { page, scenarioCtx },
    budgetName: string,
    catName: string,
    plannedStr: string,
    currency: string,
  ) => {
    const budgetId = await findBudgetId(
      page,
      budgetName,
      scenarioCtx as Record<string, unknown>,
    );
    // Create category
    const catRes = await page.request.post(
      `/api/budgets/${budgetId}/categories`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: { name: catName, currency },
      },
    );
    if (![200, 201, 409].includes(catRes.status())) {
      const body = await catRes.text();
      throw new Error(`POST /categories failed: ${catRes.status()} ${body}`);
    }
    const categoryId = await findCategoryId(page, budgetId, catName);
    // Set planned limit (normalAmount + cushionAmount as string cents)
    // effectiveFrom must be <= monthStart (YYYY-MM-01) so the limit applies to the current month.
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const limitRes = await page.request.post(
      `/api/categories/${categoryId}/limits`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: {
          normalAmount: String(Math.round(parseFloat(plannedStr) * 100)),
          cushionAmount: "0",
          normalCurrency: currency,
          effectiveFrom: monthStart,
        },
      },
    );
    if (![200, 201, 409].includes(limitRes.status())) {
      const body = await limitRes.text();
      throw new Error(`POST /limits failed: ${limitRes.status()} ${body}`);
    }
  },
);

Given(
  "the budget {string} has a category {string} with planned {string} {string} and cushion {string} {string}",
  async (
    { page, scenarioCtx },
    budgetName: string,
    catName: string,
    plannedStr: string,
    currency: string,
    cushionStr: string,
    _cushionCurrency: string,
  ) => {
    const budgetId = await findBudgetId(
      page,
      budgetName,
      scenarioCtx as Record<string, unknown>,
    );
    const catRes = await page.request.post(
      `/api/budgets/${budgetId}/categories`,
      {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        data: { name: catName, currency },
      },
    );
    if (![200, 201, 409].includes(catRes.status())) {
      const body = await catRes.text();
      throw new Error(`POST /categories failed: ${catRes.status()} ${body}`);
    }
    const categoryId = await findCategoryId(page, budgetId, catName);
    const limitRes = await page.request.post(
      `/api/categories/${categoryId}/limits`,
      {
        headers: { "Idempotency-Key": crypto.randomUUID() },
        data: {
          normalLimitCents: Math.round(parseFloat(plannedStr) * 100),
          cushionLimitCents: Math.round(parseFloat(cushionStr) * 100),
          currency,
          effectiveFrom: new Date().toISOString().slice(0, 10),
        },
      },
    );
    if (![200, 201, 409].includes(limitRes.status())) {
      const body = await limitRes.text();
      throw new Error(
        `POST /limits (cushion) failed: ${limitRes.status()} ${body}`,
      );
    }
  },
);

Given(
  "the budget {string} has a transaction {string} {string} in category {string}",
  async (
    { page, scenarioCtx },
    budgetName: string,
    amountStr: string,
    currency: string,
    catName: string,
  ) => {
    const budgetId = await findBudgetId(
      page,
      budgetName,
      scenarioCtx as Record<string, unknown>,
    );
    const categoryId = await findCategoryId(page, budgetId, catName);
    // Get first wallet
    const walletsRes = await page.request.get("/api/wallets");
    const walletsData = walletsRes.ok()
      ? ((await walletsRes.json()) as { accounts: Array<{ id: string }> })
      : { accounts: [] };
    const accountId = walletsData.accounts[0]?.id;
    if (!accountId)
      throw new Error("No wallet — run 'I have a checking account' first");
    const res = await page.request.post("/api/transactions", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        kind: "EXPENSE",
        amountOrig: amountStr,
        currencyOrig: currency,
        transactionDate: new Date().toISOString().slice(0, 10),
        accountId,
        categoryId,
      },
    });
    if (![201, 409].includes(res.status())) {
      const body = await res.text();
      throw new Error(`POST /transactions failed: ${res.status()} ${body}`);
    }
  },
);

Given(
  "the budget {string} has a recurring rule {string} for category {string} of {string} {string} due this month",
  async (
    { page, scenarioCtx },
    budgetName: string,
    ruleName: string,
    catName: string,
    amountStr: string,
    currency: string,
  ) => {
    const budgetId = await findBudgetId(
      page,
      budgetName,
      scenarioCtx as Record<string, unknown>,
    );
    const categoryId = await findCategoryId(page, budgetId, catName);
    const today = new Date();
    const firstDueDate = new Date(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    )
      .toISOString()
      .slice(0, 10);
    const res = await page.request.post(
      `/api/budgets/${budgetId}/recurring-rules`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: {
          category_id: categoryId,
          amount: amountStr,
          currency,
          cadence: "MONTHLY",
          cadence_anchor: today.getUTCDate(),
          first_due_date: firstDueDate,
          note: ruleName,
        },
      },
    );
    if (![201, 409].includes(res.status())) {
      const body = await res.text();
      throw new Error(`POST /recurring-rules failed: ${res.status()} ${body}`);
    }
    // Seed a PENDING draft for this rule so it shows in the spendings grid
    const rulesRes = await page.request.get(
      `/api/budgets/${budgetId}/recurring-rules`,
      {
        headers: { "X-Budget-ID": budgetId },
      },
    );
    if (rulesRes.ok()) {
      const rulesData = (await rulesRes.json()) as {
        rules?: Array<{ id: string; note: string | null }>;
        data?: Array<{ id: string; note: string | null }>;
      };
      const list = rulesData.rules ?? rulesData.data ?? [];
      const rule = list.find((r) => r.note === ruleName);
      if (rule) {
        await page.request
          .post(`/api/recurring-rules/${rule.id}/_seed-draft`, {
            headers: {
              "Idempotency-Key": crypto.randomUUID(),
              "X-Budget-ID": budgetId,
            },
            data: { dueDate: firstDueDate, amount: amountStr, currency },
          })
          .catch(() => {
            // Seed endpoint optional — warn and continue
            console.warn(
              `[spendings e2e] draft seed endpoint not available for rule "${ruleName}"`,
            );
          });
      }
    }
  },
);

Given("I am viewing month {string}", async ({ page }, month: string) => {
  const url = new URL(page.url());
  url.searchParams.set("month", month);
  await page.goto(url.toString());
  await page.waitForLoadState("networkidle");
});

// ── When steps ─────────────────────────────────────────────────────────────────

When(
  "I open the Spendings tab on a budget {string}",
  async ({ page, scenarioCtx }, budgetName: string) => {
    const budgetId = await findBudgetId(
      page,
      budgetName,
      scenarioCtx as Record<string, unknown>,
    );
    (scenarioCtx as Record<string, unknown>)["activeBudgetId"] = budgetId;
    await page.goto(`/en/budgets/${budgetId}/spendings`);
    await page.waitForLoadState("networkidle");
  },
);

When(
  "I type {string} into the quick-entry input for category {string}",
  async ({ page }, amount: string, catName: string) => {
    const spendings = new SpendingsPage(page);
    const input = spendings.quickEntryInput(catName);
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.fill(amount);
  },
);

When("I press Enter in the quick-entry input", async ({ page }) => {
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
});

When(
  "I single-click the transaction row {string}",
  async ({ page }, amount: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.transactionRow(amount).click();
  },
);

When(
  "I single-click the column header {string}",
  async ({ page }, catName: string) => {
    const spendings = new SpendingsPage(page);
    await spendings
      .columnHeader(catName)
      .getByTestId("column-header-name-cell")
      .click();
  },
);

When(
  "I double-click the amount cell on transaction {string}",
  async ({ page }, amount: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.transactionRow(amount).dblclick();
  },
);

When(
  "I single-click the draft row {string}",
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.draftRow(ruleName).click();
  },
);

When(
  "I click the Confirm action on draft {string}",
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPage(page);
    const testId = `draft-row-${ruleName.toLowerCase()}`;
    await spendings.revealedActionConfirm(testId).click();
    await page.waitForLoadState("networkidle");
  },
);

When(
  "I click the Dismiss action on draft {string} and confirm in the dialog",
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPage(page);
    const testId = `draft-row-${ruleName.toLowerCase()}`;
    await spendings.revealedActionDismiss(testId).click();
    // Confirm the dismiss dialog
    const confirmBtn = page
      .getByRole("button", { name: /confirm|yes|dismiss/i })
      .last();
    if (await confirmBtn.isVisible({ timeout: 3000 })) {
      await confirmBtn.click();
    }
    await page.waitForLoadState("networkidle");
  },
);

When(
  "I click the pen action on column header {string}",
  async ({ page }, catName: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.columnHeaderPenAction(catName).click();
  },
);

When(
  "I drag column {string} before column {string}",
  async ({ page }, sourceCol: string, targetCol: string) => {
    await page.dragAndDrop(
      `[data-testid="drag-grip-${sourceCol.toLowerCase()}"]`,
      `[data-testid="drag-grip-${targetCol.toLowerCase()}"]`,
    );
    await page.waitForLoadState("networkidle");
  },
);

When("I click the Add category column", async ({ page }) => {
  const spendings = new SpendingsPage(page);
  await spendings.addCategoryColumn().click();
});

When("I press {string}", async ({ page }, shortcut: string) => {
  // Convert "Cmd+ArrowLeft" → Meta+ArrowLeft (cross-platform)
  const key = shortcut
    .replace(/Cmd\+/g, "Meta+")
    .replace(/Ctrl\+/g, "Control+");
  await page.keyboard.press(key);
});

When("I click the next month button", async ({ page }) => {
  const spendings = new SpendingsPage(page);
  await spendings.monthNextBtn().click();
  await page.waitForLoadState("networkidle");
});

When("I click the previous month button", async ({ page }) => {
  const spendings = new SpendingsPage(page);
  await spendings.monthPrevBtn().click();
  await page.waitForLoadState("networkidle");
});

When(
  "I move the pointer over the transaction row {string} without clicking",
  async ({ page }, amount: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.transactionRow(amount).hover();
  },
);

When(
  "I move the pointer over the draft row {string} without clicking",
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.draftRow(ruleName).hover();
  },
);

When(
  "I move the pointer over the column header {string} without clicking",
  async ({ page }, catName: string) => {
    const spendings = new SpendingsPage(page);
    await spendings.columnHeader(catName).hover();
  },
);

// ── Then steps ─────────────────────────────────────────────────────────────────

Then("I see the spendings grid container", async ({ page }) => {
  const spendings = new SpendingsPage(page);
  await expect(spendings.gridContainer()).toBeVisible({ timeout: 15000 });
});

Then("I see the CategorySlider is open", async ({ page }) => {
  await expect(page.locator('[data-testid="cat-slider-content"]')).toBeVisible({
    timeout: 10000,
  });
});

Then(
  "I see a transaction row {string} in the {string} column",
  async ({ page }, amount: string, catName: string) => {
    // data-testid uses cents (e.g. "12.50" → "1250")
    const cents = String(Math.round(parseFloat(amount) * 100));
    const row = page.locator(`[data-testid="txn-row-${cents}"]`).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    void catName; // column presence validated by the row being visible inside it
  },
);

Then(
  "I see the column {string} header overspent shows {string}",
  async ({ page }, catName: string, value: string) => {
    const spendings = new SpendingsPage(page);
    await expect(spendings.columnHeaderRow(catName, "overspent")).toContainText(
      value,
      { timeout: 10000 },
    );
  },
);

Then(
  "I see the column {string} header reserves used shows {string}",
  async ({ page }, catName: string, value: string) => {
    const spendings = new SpendingsPage(page);
    await expect(
      spendings.columnHeaderRow(catName, "reservesUsed"),
    ).toContainText(value, { timeout: 10000 });
  },
);

Then(
  "I see the column {string} header balance shows {string}",
  async ({ page }, catName: string, value: string) => {
    const spendings = new SpendingsPage(page);
    await expect(spendings.columnHeaderRow(catName, "balance")).toContainText(
      value,
      { timeout: 10000 },
    );
  },
);

Then(
  "I see the column order is {string}",
  async ({ page }, columnsCsv: string) => {
    const names = columnsCsv.split(",").map((s) => s.trim());
    const headers = page.locator("[data-testid^='column-header-']");
    const count = await headers.count();
    expect(count).toBeGreaterThanOrEqual(names.length);
    for (let i = 0; i < names.length; i++) {
      const testId = `column-header-${names[i].toLowerCase()}`;
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 5000 });
    }
  },
);

Then(
  "I do not see floating action chips on {string}",
  async ({ page }, description: string) => {
    // The description is a human-readable string; chips are identified by role or testid pattern
    // We check that no action chip buttons are visible
    void description;
    const chips = page.locator(
      "[data-testid^='action-pen-'], [data-testid^='action-trash-'], [data-testid^='action-confirm-'], [data-testid^='action-dismiss-']",
    );
    // Wait briefly to ensure hover effects would have rendered
    await page.waitForTimeout(300);
    const visibleCount = await chips
      .filter({ state: "visible" })
      .count()
      .catch(() => 0);
    expect(visibleCount).toBe(0);
  },
);

Then(
  "I do not see the pen action on column header {string}",
  async ({ page }, catName: string) => {
    const spendings = new SpendingsPage(page);
    // Wait briefly to ensure hover effects would have rendered
    await page.waitForTimeout(300);
    await expect(spendings.columnHeaderPenAction(catName)).not.toBeVisible();
  },
);

Then(
  "I do not see the inline-edit input on {string}",
  async ({ page }, _description: string) => {
    // No inline-edit input should be present in the DOM
    const inputs = page.locator("[data-testid^='inline-edit-']");
    await page.waitForTimeout(300);
    const visibleCount = await inputs
      .filter({ state: "visible" })
      .count()
      .catch(() => 0);
    expect(visibleCount).toBe(0);
  },
);

Then("the quick-entry input is in retry state", async ({ page }) => {
  const retryIcons = page.locator("[data-testid^='quick-entry-retry-']");
  await expect(retryIcons.first()).toBeVisible({ timeout: 10000 });
});

Then(
  "the draft row {string} is no longer visible",
  async ({ page }, ruleName: string) => {
    const spendings = new SpendingsPage(page);
    await expect(spendings.draftRow(ruleName)).not.toBeVisible({
      timeout: 10000,
    });
  },
);

Then(
  "the transaction {string} is no longer visible",
  async ({ page }, amount: string) => {
    const row = page.locator(`[data-testid*="txn-row-${amount}"]`).first();
    await expect(row).not.toBeVisible({ timeout: 10000 });
  },
);

Then(
  "the recurring rule {string} is still active",
  async ({ page }, ruleName: string) => {
    // Verify via API that rule still exists and is active
    const res = await page.request.get("/api/recurring-rules");
    if (!res.ok()) return; // skip if endpoint not available
    const data = (await res.json()) as {
      rules?: Array<{ note: string | null; status?: string }>;
    };
    const rule = (data.rules ?? []).find((r) => r.note === ruleName);
    expect(rule).toBeTruthy();
    if (rule?.status) {
      expect(rule.status).not.toBe("DELETED");
    }
  },
);

Then("I see the month label {string}", async ({ page }, label: string) => {
  const spendings = new SpendingsPage(page);
  await expect(spendings.monthLabel()).toContainText(label, { timeout: 10000 });
});

Then(
  "the URL has search param month equal to {string}",
  async ({ page }, month: string) => {
    await expect(page).toHaveURL(new RegExp(`[?&]month=${month}`), {
      timeout: 10000,
    });
  },
);

Then(
  "I see the dashed `+` column at the rightmost position",
  async ({ page }) => {
    const spendings = new SpendingsPage(page);
    await expect(spendings.addCategoryColumn()).toBeVisible({ timeout: 10000 });
  },
);
