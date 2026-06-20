import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import { testSharedUser } from "../fixtures/fresh-user-per-scenario";
import { SettingsPo } from "../page-objects/SettingsPo";
import { ShareLinkPo } from "../page-objects/ShareLinkPo";

const { Given, When, Then } = createBdd(testSharedUser);

// ─── Background ───────────────────────────────────────────────────────────────

Given("I am signed in as a fresh shared user", async ({ sharedUser }) => {
  // Fixture has already created the SHARED budget and seeded the session cookie.
  void sharedUser;
});

When(
  "I navigate to the shared budget settings page",
  async ({ page, sharedUser }) => {
    await page.goto(`/en/budgets/${sharedUser.budgetId}/settings`);
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  },
);

// ─── Share link — owner side ─────────────────────────────────────────────────

When("I generate an invite link", async ({ page }) => {
  const settings = new SettingsPo(page);
  // Members section is collapsed by default — expand it first.
  await settings.openMembersSection();
  await settings.clickGenerateInviteLink();
  // Wait for the share URL field to appear after the API call.
  await expect(settings.shareUrlField()).toBeVisible({ timeout: 8000 });
});

Then("the share URL field is visible and contains a URL", async ({ page }) => {
  const settings = new SettingsPo(page);
  const field = settings.shareUrlField();
  await expect(field).toBeVisible({ timeout: 5000 });
  const value = await field.inputValue();
  expect(value).toMatch(/https?:\/\//);
});

// ─── Share link — recipient side ─────────────────────────────────────────────

/**
 * Extract the invite token from the share URL field value.
 * The token is the last path segment of the URL:
 * e.g. https://host/en/budgets/join/<token>
 * Stores the token on the scenario world via a module-level variable.
 */
let _copiedToken = "";

When("I copy the invite token from the share URL field", async ({ page }) => {
  const settings = new SettingsPo(page);
  const value = await settings.shareUrlField().inputValue();
  // Extract last path segment as token.
  const match = value.match(/\/([^/?#]+)(?:[?#].*)?$/);
  _copiedToken = match?.[1] ?? "";
  expect(_copiedToken).toBeTruthy();
});

When("I visit the join page with the copied token", async ({ page }) => {
  const shareLink = new ShareLinkPo(page);
  await shareLink.goto(_copiedToken);
});

When(
  /^I visit the join page with token "(.+?)"$/,
  async ({ page }, token: string) => {
    const shareLink = new ShareLinkPo(page);
    await shareLink.goto(token);
  },
);

Then("the join card is visible", async ({ page }) => {
  const shareLink = new ShareLinkPo(page);
  await expect(shareLink.joinCard()).toBeVisible({ timeout: 8000 });
});

Then("the join error heading is visible", async ({ page }) => {
  const shareLink = new ShareLinkPo(page);
  await expect(shareLink.errorHeading()).toBeVisible({ timeout: 8000 });
});
