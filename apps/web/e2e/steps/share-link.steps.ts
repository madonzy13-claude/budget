import { createBdd } from "playwright-bdd";
import { expect } from "@playwright/test";
import {
  testSharedUser,
  signUpViaHttp,
  parseSetCookieToPlaywright,
} from "../fixtures/fresh-user-per-scenario";
import { SettingsPo } from "../page-objects/SettingsPo";
import { ShareLinkPo } from "../page-objects/ShareLinkPo";
import { TopNavPo } from "../page-objects/TopNavPo";
import { SwitcherPo } from "../page-objects/SwitcherPo";

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

// ─── Accept flow — second user joins and sees the budget in the switcher ─────

When(
  "a second fresh user visits the join page with the copied token",
  async ({ page, context, sharedUser }) => {
    // Swap the owner's session for a brand-new user's (mailpit-verified).
    const email = `share-accept-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}@test.local`;
    const { setCookieHeaders } = await signUpViaHttp(
      sharedUser.baseUrl,
      email,
      "Test1234!Phase3",
      "Invite Recipient",
    );
    await context.clearCookies();
    const cookies = setCookieHeaders
      .map((line) => parseSetCookieToPlaywright(line, sharedUser.baseUrl))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    await context.addCookies(cookies);
    await new ShareLinkPo(page).goto(_copiedToken);
  },
);

When("they accept the invite", async ({ page }) => {
  const shareLink = new ShareLinkPo(page);
  await shareLink.joinConfirmButton().click();
  // Accept lands on the joined budget's spendings tab (client-side push).
  await page.waitForURL(/\/budgets\/[0-9a-f-]+\/spendings/, {
    timeout: 20000,
  });
});

Then(
  "the header switcher lists the shared budget",
  async ({ page, sharedUser }) => {
    // Regression: the switcher used to render only the SSR prop, so the
    // just-joined budget was missing until a full reload. The live query must
    // resolve the name in the dropdown (and on the trigger) with NO reload.
    const nav = new TopNavPo(page);
    await nav.switcherTrigger().click();
    const sw = new SwitcherPo(page);
    await expect(sw.budgetRow(sharedUser.budgetName)).toBeVisible({
      timeout: 10000,
    });
  },
);

Then("the join error heading is visible", async ({ page }) => {
  const shareLink = new ShareLinkPo(page);
  await expect(shareLink.errorHeading()).toBeVisible({ timeout: 8000 });
});
