/**
 * cursor.steps.ts — BDD steps for the @cursor-affordance guard.
 *
 * Asserts the resolved (computed) `cursor` of interactive elements, which is
 * exactly what the browser renders on hover. The global rule lives unlayered
 * in apps/web/src/app/global.css; if a future change traps it in @layer base
 * or a utility overrides it, these assertions fail in CI instead of shipping a
 * dead-cursor build.
 */
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";

const { When, Then } = createBdd(test);

When("I visit the sign-in page for cursor checks", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page
    .getByRole("button", { name: /sign in/i })
    .waitFor({ state: "visible", timeout: 10_000 });
});

Then("the sign-in button shows a pointer cursor", async ({ page }) => {
  const cursor = await page
    .getByRole("button", { name: /sign in/i })
    .evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe("pointer");
});

Then("every link shows a pointer cursor", async ({ page }) => {
  const cursors = await page.$$eval("a[href]", (els) =>
    els.map((el) => getComputedStyle(el).cursor),
  );
  expect(cursors.length).toBeGreaterThan(0);
  for (const cursor of cursors) expect(cursor).toBe("pointer");
});
