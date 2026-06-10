import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { type Locale } from "../pages/labels.js";

const { When, Then } = createBdd(test);

function asLocale(s: string): Locale {
  if (s === "en" || s === "pl" || s === "uk") return s;
  throw new Error(`Unknown locale: ${s}`);
}

When(
  "I navigate to an unmatched url under {string}",
  async ({ page, scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const nf = new NotFoundPage(page, locale);
    await nf.gotoUnmatched();
    scenarioCtx.notFoundPage = nf;
  },
);

When("I click the not-found home button", async ({ scenarioCtx }) => {
  const nf = scenarioCtx.notFoundPage as NotFoundPage;
  await nf.clickHome();
});

Then(
  "I see the friendly 404 screen in {string}",
  async ({ scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const nf = scenarioCtx.notFoundPage as NotFoundPage;
    await nf.expectVisible();
    const expected = {
      en: "Page not found",
      pl: "Nie znaleziono strony",
      uk: "Сторінку не знайдено",
    } as const;
    await nf.expectHeading(expected[locale]);
  },
);

Then("I am no longer on the unmatched url", async ({ page }) => {
  // Home click navigates to /[locale]. Anonymous users get bounced to
  // /sign-in by the (app) layout; either landing is acceptable — both
  // are "not the original 404 URL".
  await expect(page).not.toHaveURL(/does-not-exist-/, { timeout: 10000 });
});
