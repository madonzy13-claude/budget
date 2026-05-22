/**
 * join.steps.ts — BDD step definitions for Phase 6 share-link join flow.
 * Tags: @phase6
 *
 * "a budget owner has created a shared budget" creates a user + SHARED budget
 * and stores the share token in scenarioCtx.shareToken.
 * "an unauthenticated user visits the share link" uses a fresh browser context
 * (no auth cookies) to verify the page renders without bouncing to sign-in.
 */
import { expect, request } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { JoinPage } from "../pages/JoinPage.js";
import { createFreshUser } from "../fixtures/freshUser.js";

const { Given, When, Then } = createBdd(test);

function getShareToken(scenarioCtx: Record<string, unknown>): string {
  const token = scenarioCtx["shareToken"] as string | undefined;
  if (!token)
    throw new Error(
      "shareToken not in scenarioCtx — run 'the owner has generated a share link' first",
    );
  return token;
}

function getBudgetId(scenarioCtx: Record<string, unknown>): string {
  const id = scenarioCtx["ownerBudgetId"] as string | undefined;
  if (!id)
    throw new Error(
      "ownerBudgetId not in scenarioCtx — run 'a budget owner has created a shared budget' first",
    );
  return id;
}

// ── Given steps ────────────────────────────────────────────────────────────────

Given(
  "a budget owner has created a shared budget {string}",
  async ({ page, scenarioCtx }, budgetName: string) => {
    const user = await createFreshUser(page, "en");
    scenarioCtx.freshUser = user;

    const create = await page.request.post("/api/budgets", {
      data: { name: budgetName, kind: "SHARED", default_currency: "EUR" },
    });
    expect(create.ok()).toBeTruthy();
    const { id } = (await create.json()) as { id: string };
    (scenarioCtx as Record<string, unknown>)["ownerBudgetId"] = id;
    (scenarioCtx as Record<string, unknown>)["ownerBudgetName"] = budgetName;
    (scenarioCtx as Record<string, unknown>)["workspaceId"] = id;
  },
);

Given(
  "the owner has generated a share link for that budget",
  async ({ page, scenarioCtx }) => {
    const budgetId = getBudgetId(scenarioCtx as Record<string, unknown>);
    const res = await page.request.post(
      `/api/budgets/${budgetId}/share-links`,
      { data: {} },
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { token: string } | { url: string };
    // API may return { token } or { url: ".../<token>" }
    let token: string;
    if ("token" in body) {
      token = body.token;
    } else {
      const parts = body.url.split("/");
      token = parts[parts.length - 1];
    }
    (scenarioCtx as Record<string, unknown>)["shareToken"] = token;
  },
);

Given(
  "a share link with token {string}",
  async ({ scenarioCtx }, token: string) => {
    (scenarioCtx as Record<string, unknown>)["shareToken"] = token;
  },
);

// ── When steps ─────────────────────────────────────────────────────────────────

When("an unauthenticated user visits the share link", async ({ page, scenarioCtx }) => {
  const token = getShareToken(scenarioCtx as Record<string, unknown>);
  // Clear cookies to simulate unauthenticated state
  await page.context().clearCookies();
  const joinPage = new JoinPage(page);
  await joinPage.open("en", token);
});

When("I visit the share link", async ({ page, scenarioCtx }) => {
  const token = getShareToken(scenarioCtx as Record<string, unknown>);
  const joinPage = new JoinPage(page);
  await joinPage.open("en", token);
});

When("I click the join button", async ({ page }) => {
  const joinPage = new JoinPage(page);
  await joinPage.joinCta().click();
  await page.waitForLoadState("networkidle");
});

// ── Then steps ─────────────────────────────────────────────────────────────────

Then("they see the join page card", async ({ page }) => {
  const joinPage = new JoinPage(page);
  await expect(joinPage.card()).toBeVisible({ timeout: 15000 });
  // Must not have been redirected to sign-in
  await expect(page).not.toHaveURL(/\/sign-in/);
});

Then(
  "they see the {string} button",
  async ({ page }, label: string) => {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") }),
    ).toBeVisible({ timeout: 10000 });
  },
);

Then(
  "I see the join page card with the budget name {string}",
  async ({ page }, budgetName: string) => {
    const joinPage = new JoinPage(page);
    await expect(joinPage.card()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(new RegExp(budgetName, "i"))).toBeVisible({
      timeout: 10000,
    });
  },
);

Then(
  "I see the {string} button",
  async ({ page }, label: string) => {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") }),
    ).toBeVisible({ timeout: 10000 });
  },
);

Then(
  "I land on the spendings tab for {string}",
  async ({ page }, _budgetName: string) => {
    await expect(page).toHaveURL(/\/budgets\/[0-9a-f-]+\/spendings/, {
      timeout: 20000,
    });
  },
);

Then("I see an error state on the join page", async ({ page }) => {
  const joinPage = new JoinPage(page);
  // Any of the error states renders an error heading
  await expect(joinPage.errorHeading()).toBeVisible({ timeout: 15000 });
});

Then("I see a link to return home", async ({ page }) => {
  const joinPage = new JoinPage(page);
  await expect(joinPage.errorCta()).toBeVisible({ timeout: 10000 });
});
