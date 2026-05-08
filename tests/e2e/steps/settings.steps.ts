import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { SettingsPage } from "../pages/SettingsPage.js";
import { LOCALE_LABELS, type Locale } from "../pages/labels.js";

const { When, Then } = createBdd(test);

function localeFromUrl(url: string): Locale {
  const m = url.match(/\/(en|pl|uk)\//);
  if (m && (m[1] === "en" || m[1] === "pl" || m[1] === "uk")) return m[1];
  return "en";
}

When("I open the Display currency tab", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const sp = new SettingsPage(page, locale);
  await sp.openDisplayCurrencyTab();
});

When(
  "I pick the {string} display currency",
  async ({ page, scenarioCtx }, code: string) => {
    const locale = localeFromUrl(page.url());
    const sp = new SettingsPage(page, locale);
    const labels = LOCALE_LABELS[locale];
    const map: Record<string, string> = {
      USD: labels.currencyPicker.usDollarLabel,
      UAH: labels.currencyPicker.ukrainianHryvniaLabel,
    };
    const display = map[code];
    if (!display)
      throw new Error(`No display label for currency code: ${code}`);

    // Capture the API response from the click-driven mutation so subsequent
    // assertions can verify the server accepted the change.
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/settings/display-currency") &&
          res.request().method() === "PUT",
        { timeout: 10000 },
      ),
      sp.pickDisplayCurrency(display),
    ]);
    (scenarioCtx as Record<string, unknown>)[
      "lastDisplayCurrencyResponseStatus"
    ] = response.status();
  },
);

Then("the display-currency API responded 200", async ({ scenarioCtx }) => {
  const status = (scenarioCtx as Record<string, unknown>)[
    "lastDisplayCurrencyResponseStatus"
  ] as number | undefined;
  expect(status).toBe(200);
});

Then(
  "the display currency trigger shows {string}",
  async ({ page }, label: string) => {
    const locale = localeFromUrl(page.url());
    const sp = new SettingsPage(page, locale);
    await sp.expectDisplayCurrencyTriggerShows(label);
  },
);

When("I open the Language tab", async ({ page }) => {
  const locale = localeFromUrl(page.url());
  const sp = new SettingsPage(page, locale);
  await sp.openLocaleTab();
});

When(
  "I switch the language to {string}",
  async ({ page, scenarioCtx }, target: string) => {
    if (target !== "en" && target !== "pl" && target !== "uk")
      throw new Error(`Unsupported locale target: ${target}`);
    const currentLocale = localeFromUrl(page.url());
    const sp = new SettingsPage(page, currentLocale);
    const labels = LOCALE_LABELS[currentLocale];
    const optionLabel = labels.settings.localeOption[target as Locale];

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/settings/locale") &&
          res.request().method() === "PUT",
        { timeout: 10000 },
      ),
      sp
        .openLocalePicker()
        .then(() => page.getByRole("option", { name: optionLabel }).click()),
    ]);
    (scenarioCtx as Record<string, unknown>)["lastLocaleResponseStatus"] =
      response.status();
  },
);

Then("the locale API responded 200", async ({ scenarioCtx }) => {
  const status = (scenarioCtx as Record<string, unknown>)[
    "lastLocaleResponseStatus"
  ] as number | undefined;
  expect(status).toBe(200);
});

Then("the URL is on locale {string}", async ({ page }, expected: string) => {
  await expect(page).toHaveURL(new RegExp(`^[^?]*\\/${expected}(\\/|$|\\?)`), {
    timeout: 10000,
  });
});
