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

When("I open the demo entry point", async ({ page }) => {
  await new DemoPo(page).openDemo();
});

When("I reload the demo page", async ({ page }) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  // Same settle as openDemo: assert on the dialog only once the shell is up,
  // or "not visible" passes vacuously against a half-rendered page.
  await new DemoPo(page).banner
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});
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

Given(
  "a visitor chose {string} in the demo welcome dialog",
  async ({ page }, label: string) => {
    const po = new DemoPo(page);
    await po.openDemo();
    await po.chooseLanguage(label);
  },
);

When("a different visitor opens the demo entry point", async ({ browser }) => {
  // A whole new context, not just a new page: the point is that this visitor
  // shares NOTHING client-side with the first one, so if the language had
  // been persisted server-side on the shared account it would show up here.
  secondContext = await browser.newContext();
  secondPage = await secondContext.newPage();
  await new DemoPo(secondPage).openDemo();
});

Then("that visitor sees the demo welcome dialog", async ({}) => {
  if (!secondPage) throw new Error("second visitor was never opened");
  await expect(new DemoPo(secondPage).dialog).toBeVisible({ timeout: 10_000 });
});

Then("that visitor's URL contains {string}", async ({}, fragment: string) => {
  if (!secondPage) throw new Error("second visitor was never opened");
  await expect(secondPage).toHaveURL(
    new RegExp(fragment.replace(/\//g, "\\/")),
  );
  await secondContext?.close();
  secondContext = undefined;
  secondPage = undefined;
});

Then("both demo budgets are listed", async ({ page }) => {
  // Asserted by NAME on the landing page rather than through the switcher
  // dropdown: the switcher trigger is budget-detail chrome and is not present
  // on the demo's landing route, so opening it timed out. What the scenario
  // actually cares about is that both budgets exist and are reachable.
  // Generous, because the aggregate recomputes across BOTH budgets and
  // converts a PLN budget into USD on the way — it is the slowest page the
  // demo has. Still bounded, so a real regression fails here rather than
  // consuming the whole test timeout.
  const po = new DemoPo(page);
  await expect(po.budgetNamed("Personal")).toBeVisible({ timeout: 30_000 });
  await expect(po.budgetNamed("Family")).toBeVisible({ timeout: 30_000 });
});

Then("the all-budgets overview renders a total", async ({ page }) => {
  await new DemoPo(page).openAggregate();
  await expect(new DemoPo(page).aggregateTotal).toBeVisible({
    timeout: 30_000,
  });
});

let lastInviteStatus: number | undefined;

When("I attempt to invite a member", async ({ page }) => {
  lastInviteStatus = await new DemoPo(page).attemptInvite();
});

Then("the action is refused as demo-restricted", async ({}) => {
  expect(lastInviteStatus).toBe(403);
});
