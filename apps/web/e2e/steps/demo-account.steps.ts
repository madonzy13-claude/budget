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
import { expect } from "@playwright/test";
import { test } from "../fixtures/fresh-user-per-scenario";
import { DemoPo } from "../page-objects/DemoPo";

const { When, Then } = createBdd(test);

When("I open the demo entry point", async ({ page }) => {
  await new DemoPo(page).openDemo();
});

When("I open the sign-in page as a new visitor", async ({ page }) => {
  await new DemoPo(page).openSignIn();
});

When("I click the demo entry link", async ({ page }) => {
  await new DemoPo(page).openLanguagePicker();
});

Then("the demo entry link is visible", async ({ page }) => {
  await expect(new DemoPo(page).entryLink).toBeVisible({ timeout: 15_000 });
});

Then("the demo language picker is visible", async ({ page }) => {
  await expect(new DemoPo(page).picker).toBeVisible({ timeout: 15_000 });
});

Then(
  "the picker offers {string}, {string} and {string}",
  async ({ page }, en: string, pl: string, uk: string) => {
    const po = new DemoPo(page);
    for (const label of [en, pl, uk]) {
      await expect(po.languageButton(label)).toBeVisible();
    }
  },
);

When(
  "I choose {string} in the demo language picker",
  async ({ page }, label: string) => {
    await new DemoPo(page).chooseLanguage(label);
  },
);

Then("I am signed in", async ({ page }) => {
  await expect(page).not.toHaveURL(/\/sign-in/);
  await expect(new DemoPo(page).banner).toBeVisible({ timeout: 20_000 });
});

Then("the demo banner is visible", async ({ page }) => {
  await expect(new DemoPo(page).banner).toBeVisible({ timeout: 20_000 });
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
