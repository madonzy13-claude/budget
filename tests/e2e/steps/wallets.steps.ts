/**
 * wallets.steps.ts — BDD step definitions for Phase 5 Wallets tab features.
 * Tags: @phase5
 *
 * W-5 contract: ALL wallet UUID lookups go through WalletsPage.resolveIdByName()
 * which reads data-wallet-id. NEVER parse testid strings for UUIDs.
 *
 * "I am signed in as a fresh user with workspace {string}" is defined in
 * budget.steps.ts and reused here automatically by playwright-bdd.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { WalletsPage } from "../pages/WalletsPage.js";

const { Given, When, Then } = createBdd(test);

// ── DB / API seed helpers ──────────────────────────────────────────────────────

/** Resolve budget UUID from scenarioCtx (set by budget.steps.ts). */
function getBudgetId(scenarioCtx: Record<string, unknown>): string {
  const id = scenarioCtx["workspaceId"] as string | undefined;
  if (!id)
    throw new Error(
      "workspaceId not in scenarioCtx — run 'I am signed in as a fresh user with workspace' first",
    );
  return id;
}

// ── Given steps ────────────────────────────────────────────────────────────────

Given(
  "the budget {string} has a wallet {string} of type {string} with currency {string} and amount {string}",
  async (
    { page, scenarioCtx },
    _budgetName: string,
    name: string,
    walletType: string,
    currency: string,
    amount: string,
  ) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);

    // POST /wallets to create the wallet
    const res = await page.request.post("/api/wallets", {
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-Budget-ID": budgetId,
      },
      data: {
        name,
        walletType: walletType.toUpperCase(),
        currency: currency.toUpperCase(),
      },
    });
    if (![200, 201].includes(res.status())) {
      const body = await res.text();
      throw new Error(`POST /wallets failed: ${res.status()} ${body}`);
    }
    const wallet = (await res.json()) as { id: string };

    // Set the amount via PUT /wallets/:id/balance
    if (amount && parseFloat(amount) !== 0) {
      const amountCents = Math.round(parseFloat(amount) * 100);
      const balRes = await page.request.put(
        `/api/wallets/${wallet.id}/balance`,
        {
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
            "X-Budget-ID": budgetId,
          },
          data: { amountCents, currency: currency.toUpperCase() },
        },
      );
      if (!balRes.ok()) {
        const body = await balRes.text();
        throw new Error(
          `PUT /wallets/${wallet.id}/balance failed: ${balRes.status()} ${body}`,
        );
      }
    }
  },
);

// ── When steps ─────────────────────────────────────────────────────────────────

When(
  "I open the Wallets tab on a budget {string}",
  async ({ page, scenarioCtx }, _budgetName: string) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
    const wallets = new WalletsPage(page);
    await wallets.open(budgetId);
  },
);

// NOTE: "I click {string}" is defined in budget.steps.ts (generic button click).
// Section-specific add buttons use the testid add-wallet-{type}.
// Feature files use: When I click "Add spendings wallet" → budget.steps.ts handles it.

When(
  "I edit the wallet {string} name to {string}",
  async ({ page }, currentName: string, newName: string) => {
    const wallets = new WalletsPage(page);
    // If a draft row is visible (W-4 staged-add), operate on the draft input
    const draft = wallets.draftRow();
    if ((await draft.count()) > 0) {
      await wallets.draftNameInput().fill(newName);
      await wallets.draftNameInput().blur();
      await page.waitForLoadState("networkidle");
      return;
    }
    // Otherwise: resolve persisted UUID via W-5 data-wallet-id
    const id = await wallets.resolveIdByName(currentName);
    await wallets.editName(id, newName);
  },
);

When(
  "I edit the wallet {string} amount to {string}",
  async ({ page }, name: string, newAmount: string) => {
    const wallets = new WalletsPage(page);
    const id = await wallets.resolveIdByName(name);
    await wallets.editAmount(id, newAmount);
  },
);

When(
  "I drag the wallet {string} to the {string} section",
  async ({ page }, name: string, type: string) => {
    const wallets = new WalletsPage(page);
    const id = await wallets.resolveIdByName(name);
    await wallets.dragToSection(
      id,
      type.toUpperCase() as "SPENDINGS" | "CUSHION" | "RESERVE",
    );
  },
);

When(
  "I delete the wallet {string} and confirm",
  async ({ page }, name: string) => {
    const wallets = new WalletsPage(page);
    const id = await wallets.resolveIdByName(name);
    await wallets.deleteWallet(id, true);
  },
);

// ── Then steps ─────────────────────────────────────────────────────────────────

Then(
  "the {string} wallets section contains {string}",
  async ({ page }, type: string, name: string) => {
    const wallets = new WalletsPage(page);
    await expect(
      wallets
        .section(type.toUpperCase() as "SPENDINGS" | "CUSHION" | "RESERVE")
        .locator('[data-testid="wallet-row"]', { hasText: name }),
    ).toBeVisible({ timeout: 15000 });
  },
);

Then(
  "the {string} wallets section does not contain {string}",
  async ({ page }, type: string, name: string) => {
    const wallets = new WalletsPage(page);
    await expect(
      wallets
        .section(type.toUpperCase() as "SPENDINGS" | "CUSHION" | "RESERVE")
        .locator('[data-testid="wallet-row"]', { hasText: name }),
    ).toHaveCount(0, { timeout: 10000 });
  },
);

Then(
  "the wallet {string} amount is {string}",
  async ({ page }, name: string, amount: string) => {
    const wallets = new WalletsPage(page);
    const id = await wallets.resolveIdByName(name);
    await expect(wallets.amountCell(id)).toContainText(amount, {
      timeout: 10000,
    });
  },
);

Then(
  "the wallet {string} is not present in any section",
  async ({ page }, name: string) => {
    await expect(
      page.locator('[data-testid="wallet-row"]', { hasText: name }),
    ).toHaveCount(0, { timeout: 10000 });
  },
);

Then("I see a toast {string}", async ({ page }, text: string) => {
  // Sonner toast container
  const toast = page.locator("[data-sonner-toast]", { hasText: text });
  await expect(toast).toBeVisible({ timeout: 10000 });
});
