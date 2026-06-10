import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { ServerDownPage } from "../pages/ServerDownPage.js";
import { type Locale } from "../pages/labels.js";

const { Given, When, Then } = createBdd(test);

function asLocale(s: string): Locale {
  if (s === "en" || s === "pl" || s === "uk") return s;
  throw new Error(`Unknown locale: ${s}`);
}

function getOrCreatePage(
  page: import("@playwright/test").Page,
  scenarioCtx: import("../fixtures/freshUser.js").ScenarioCtx,
  fallbackLocale: Locale = "en",
): ServerDownPage {
  if (scenarioCtx.serverDownPage) return scenarioCtx.serverDownPage;
  const locale = scenarioCtx.serverDownLocale ?? fallbackLocale;
  const sd = new ServerDownPage(page, locale);
  scenarioCtx.serverDownPage = sd;
  return sd;
}

Given("the api health endpoint is reachable", async ({ page, scenarioCtx }) => {
  const sd = getOrCreatePage(page, scenarioCtx);
  await sd.mockHealthUp();
});

Given(
  "the api health endpoint is unreachable",
  async ({ page, scenarioCtx }) => {
    const sd = getOrCreatePage(page, scenarioCtx);
    await sd.mockHealthDown();
  },
);

When(
  "I open the {string} server-down page",
  async ({ page, scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    scenarioCtx.serverDownLocale = locale;
    // If a Given step pre-installed network mocks on a Page object with the
    // default "en" locale, swap it for one bound to the scenario locale so
    // expectLocale assertions match.
    const existing = scenarioCtx.serverDownPage;
    const sd =
      existing && (existing as ServerDownPage)
        ? existing
        : new ServerDownPage(page, locale);
    scenarioCtx.serverDownPage = sd;
    await sd.goto();
  },
);

When("I click the server-down retry button", async ({ page, scenarioCtx }) => {
  const sd = getOrCreatePage(page, scenarioCtx);
  await sd.clickRetry();
});

Then(
  "I see the server-down screen in {string}",
  async ({ page, scenarioCtx }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const sd = getOrCreatePage(page, scenarioCtx, locale);
    await sd.expectVisible();
    await sd.expectLocale(locale);
  },
);

Then(
  "I see the server-down still-unreachable message",
  async ({ page, scenarioCtx }) => {
    const sd = getOrCreatePage(page, scenarioCtx);
    await sd.expectStillUnreachable();
  },
);

Then("I leave the server-down page", async ({ page }) => {
  // After a successful health probe the card calls window.location.reload().
  // We assert the URL no longer points at the dedicated server-down route
  // (the reload triggers middleware + the (app) layout, which routes the
  // user to wherever their session permits — sign-in for anonymous users,
  // the home grid for authenticated ones).
  await expect(page).not.toHaveURL(/\/server-down/, { timeout: 10000 });
});
