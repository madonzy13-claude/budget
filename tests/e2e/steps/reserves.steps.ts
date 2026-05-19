/**
 * reserves.steps.ts — BDD step definitions for Phase 5 Reserves tab features.
 * Tags: @phase5
 *
 * W-5 contract: ALL category UUID lookups go through ReservesPage.resolveCategoryIdByName()
 * which reads data-category-id. NEVER parse testid strings for UUIDs.
 *
 * "I am signed in as a fresh user with workspace {string}" is defined in
 * budget.steps.ts and reused automatically.
 * "the budget {string} has a category {string} with planned {string} {string}" is
 * defined in spendings.steps.ts and reused automatically.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { ReservesPage } from "../pages/ReservesPage.js";

const { Given, When, Then } = createBdd(test);

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBudgetId(scenarioCtx: Record<string, unknown>): string {
  const id = scenarioCtx["workspaceId"] as string | undefined;
  if (!id)
    throw new Error(
      "workspaceId not in scenarioCtx — run 'I am signed in as a fresh user with workspace' first",
    );
  return id;
}

/** Lookup category UUID via the categories API (used for seed steps). */
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

/**
 * Seed a reserve adjustment (delta) for a category. The legacy step parses
 * the delta from the feature file, but the API (UAT-PH5-T3-54) now takes a
 * target value — so we GET the current expected first, then POST the sum.
 * POST /budgets/:id/reserves/:categoryId/adjust { expectedCents }.
 */
Given(
  "the category {string} reserve adjustment is {string} cents",
  async ({ page, scenarioCtx }, categoryName: string, deltaStr: string) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
    const categoryId = await findCategoryId(page, budgetId, categoryName);

    // Strip + and commas, parse as integer cents.
    const deltaCents = parseInt(deltaStr.replace(/[+,]/g, ""), 10);

    // GET current summary to learn this category's current expected value.
    const sumRes = await page.request.get(`/api/budgets/${budgetId}/reserves`, {
      headers: { "X-Budget-ID": budgetId },
    });
    let currentCents = 0;
    if (sumRes.ok()) {
      const sum: any = await sumRes.json();
      const row = (sum.rows ?? []).find(
        (r: any) => r.categoryId === categoryId,
      );
      if (row?.reserveBalanceCents)
        currentCents = parseInt(row.reserveBalanceCents, 10);
    }
    const expectedCents = currentCents + deltaCents;

    const res = await page.request.post(
      `/api/budgets/${budgetId}/reserves/${categoryId}/adjust`,
      {
        headers: {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Budget-ID": budgetId,
        },
        data: { expectedCents },
      },
    );
    if (!res.ok()) {
      const body = await res.text();
      throw new Error(
        `POST /reserves/${categoryId}/adjust failed: ${res.status()} ${body}`,
      );
    }
  },
);

// ── When steps ─────────────────────────────────────────────────────────────────

When(
  "I open the Reserves tab on a budget {string}",
  async ({ page, scenarioCtx }, _budgetName: string) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
    const reserves = new ReservesPage(page);
    await reserves.open(budgetId);
  },
);

When(
  "I edit the reserve balance for {string} to {string}",
  async ({ page }, categoryName: string, amountStr: string) => {
    const reserves = new ReservesPage(page);
    const catId = await reserves.resolveCategoryIdByName(categoryName);
    // amountStr may be "EUR 800.00" — strip currency prefix, pass numeric string
    const numeric = amountStr.replace(/[^0-9.]/g, "");
    await reserves.editBalance(catId, numeric);
  },
);

When(
  "I drag the category {string} to the Excluded section",
  async ({ page }, categoryName: string) => {
    const reserves = new ReservesPage(page);
    const catId = await reserves.resolveCategoryIdByName(categoryName);
    await reserves.dragToExcluded(catId);
  },
);

When(
  "I drag the category {string} to the Active section",
  async ({ page }, categoryName: string) => {
    const reserves = new ReservesPage(page);
    const catId = await reserves.resolveCategoryIdByName(categoryName);
    await reserves.dragToActive(catId);
  },
);

// ── Then steps ─────────────────────────────────────────────────────────────────

Then("the mismatch chip is {string}", async ({ page }, variant: string) => {
  const reserves = new ReservesPage(page);
  await expect(
    reserves.mismatchChip(
      variant as "overfunded" | "underfunded" | "reconciled",
    ),
  ).toBeVisible({ timeout: 15000 });
});

Then(
  "the mismatch chip amount is {string}",
  async ({ page }, amount: string) => {
    const reserves = new ReservesPage(page);
    await expect(reserves.totalsFooter()).toContainText(amount, {
      timeout: 10000,
    });
  },
);

Then(
  "the row for {string} shows wallet share {string}",
  async ({ page }, categoryName: string, share: string) => {
    const reserves = new ReservesPage(page);
    const catId = await reserves.resolveCategoryIdByName(categoryName);
    await expect(reserves.row(catId)).toContainText(share, { timeout: 10000 });
  },
);

Then(
  "the row for {string} shows reserve balance {string}",
  async ({ page }, categoryName: string, balance: string) => {
    const reserves = new ReservesPage(page);
    const catId = await reserves.resolveCategoryIdByName(categoryName);
    await expect(reserves.balanceCell(catId)).toContainText(balance, {
      timeout: 10000,
    });
  },
);

Then(
  "the {string} total shows {string}",
  async ({ page }, _label: string, formatted: string) => {
    const reserves = new ReservesPage(page);
    await expect(reserves.totalsFooter()).toContainText(formatted, {
      timeout: 10000,
    });
  },
);

Then(
  "the Active section does not contain {string}",
  async ({ page }, name: string) => {
    const reserves = new ReservesPage(page);
    await expect(
      reserves.activeSection().locator("[data-category-id]", { hasText: name }),
    ).toHaveCount(0, { timeout: 10000 });
  },
);

Then("the Active section contains {string}", async ({ page }, name: string) => {
  const reserves = new ReservesPage(page);
  await expect(
    reserves.activeSection().locator("[data-category-id]", { hasText: name }),
  ).toBeVisible({ timeout: 15000 });
});

Then(
  "the Excluded section contains {string}",
  async ({ page }, name: string) => {
    const reserves = new ReservesPage(page);
    await expect(
      reserves
        .excludedSection()
        .locator("[data-category-id]", { hasText: name }),
    ).toBeVisible({ timeout: 15000 });
  },
);
