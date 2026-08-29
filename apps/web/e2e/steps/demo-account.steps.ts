/**
 * demo-account.steps.ts — Phase 12 demo account.
 *
 * These scenarios need the demo to be CONFIGURED on the target stack
 * (DEMO_EMAIL/DEMO_PASSWORD/DEMO_USER_ID + the tenant id lists). When it is
 * not, /demo is a 404 by design, and the whole feature is skipped rather than
 * reported as broken — an unconfigured deployment genuinely does not have this
 * feature.
 */
import { createBdd } from "playwright-bdd";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { DemoPo } from "../page-objects/DemoPo";

const { Given, When, Then } = createBdd(test);

/** A second visitor: independent context, so localStorage and cookies differ. */
let secondContext: BrowserContext | undefined;
let secondPage: Page | undefined;

When("I open {string}", async ({ page }) => {
  const po = new DemoPo(page);
  await po.openDemo();
});

Then("I am signed in", async ({ page }) => {
  await expect(page).not.toHaveURL(/\/sign-in/);
});

Then("the demo banner is visible", async ({ page }) => {
  await expect(new DemoPo(page).banner).toBeVisible({ timeout: 10_000 });
});

Then("the demo welcome dialog is visible", async ({ page }) => {
  await expect(new DemoPo(page).dialog).toBeVisible({ timeout: 10_000 });
});

Then("the demo welcome dialog is not visible", async ({ page }) => {
  await expect(new DemoPo(page).dialog).toBeHidden();
});

Then(
  "the dialog offers {string}, {string} and {string}",
  async ({ page }, en: string, pl: string, uk: string) => {
    const po = new DemoPo(page);
    for (const label of [en, pl, uk]) {
      await expect(po.languageButton(label)).toBeVisible();
    }
  },
);

When(
  "I choose {string} in the demo welcome dialog",
  async ({ page }, label: string) => {
    await new DemoPo(page).chooseLanguage(label);
  },
);

When("I dismiss the demo welcome dialog", async ({ page }) => {
  await new DemoPo(page).dismiss();
});

When("I reload the page", async ({ page }) => {
  await page.reload({ waitUntil: "domcontentloaded" });
});

Then("the URL contains {string}", async ({ page }, fragment: string) => {
  await expect(page).toHaveURL(new RegExp(fragment.replace(/\//g, "\\/")));
});

Given(
  "a visitor chose {string} in the demo welcome dialog",
  async ({ page }, label: string) => {
    const po = new DemoPo(page);
    await po.openDemo();
    await po.chooseLanguage(label);
  },
);

When(
  "a different visitor opens {string}",
  async ({ browser }, path: string) => {
    // A whole new context, not just a new page: the point is that this visitor
    // shares NOTHING client-side with the first one, so if the language had
    // been persisted server-side on the shared account it would show up here.
    secondContext = await browser.newContext();
    secondPage = await secondContext.newPage();
    await new DemoPo(secondPage).openDemo(path);
  },
);

Then("that visitor sees the demo welcome dialog", async () => {
  if (!secondPage) throw new Error("second visitor was never opened");
  await expect(new DemoPo(secondPage).dialog).toBeVisible({ timeout: 10_000 });
});

Then("that visitor's URL contains {string}", async (_ctx, fragment: string) => {
  if (!secondPage) throw new Error("second visitor was never opened");
  await expect(secondPage).toHaveURL(
    new RegExp(fragment.replace(/\//g, "\\/")),
  );
  await secondContext?.close();
  secondContext = undefined;
  secondPage = undefined;
});

Then("the budget switcher lists {int} budgets", async ({ page }, n: number) => {
  await expect(new DemoPo(page).budgetCards).toHaveCount(n, {
    timeout: 15_000,
  });
});

Then("the all-budgets overview renders a total", async ({ page }) => {
  await new DemoPo(page).openAggregate();
  await expect(new DemoPo(page).aggregateTotal).toBeVisible({
    timeout: 15_000,
  });
});

When("I attempt to invite a member", async ({ page }) => {
  const po = new DemoPo(page);
  po.lastInviteStatus = await po.attemptInvite();
});

Then("the action is refused as demo-restricted", async ({ page }) => {
  const po = new DemoPo(page);
  expect(po.lastInviteStatus).toBe(403);
});
