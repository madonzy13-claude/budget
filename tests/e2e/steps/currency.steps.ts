import { createBdd } from "playwright-bdd";
import { test } from "../fixtures/index.js";
import { OnboardingPage } from "../pages/OnboardingPage.js";
import { LOCALE_LABELS, type Locale } from "../pages/labels.js";

const { When, Then } = createBdd(test);

function asLocale(s: string): Locale {
  if (s === "en" || s === "pl" || s === "uk") return s;
  throw new Error(`Unknown locale: ${s}`);
}

When("I open the currency picker", async ({ page }) => {
  const url = page.url();
  const localeMatch = url.match(/\/(en|pl|uk)\//);
  const locale = asLocale(localeMatch?.[1] ?? "en");
  const onboardingPage = new OnboardingPage(page, locale);
  await onboardingPage.openCurrencyPicker();
});

Then(
  "the currency picker shows the {string} trigger placeholder",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const onboardingPage = new OnboardingPage(page, locale);
    await onboardingPage.expectTriggerVisible();
  },
);

Then(
  "the currency picker top-currencies header is shown in {string}",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const onboardingPage = new OnboardingPage(page, locale);
    await onboardingPage.expectTopCurrenciesHeader();
  },
);

Then(
  "the currency picker offers the US-dollar option in {string}",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const labels = LOCALE_LABELS[locale];
    const onboardingPage = new OnboardingPage(page, locale);
    await onboardingPage.expectCurrencyOption(
      labels.currencyPicker.usDollarLabel,
    );
  },
);

Then(
  "the currency picker offers the Ukrainian-hryvnia option in {string}",
  async ({ page }, localeStr: string) => {
    const locale = asLocale(localeStr);
    const labels = LOCALE_LABELS[locale];
    const onboardingPage = new OnboardingPage(page, locale);
    await onboardingPage.expectCurrencyOption(
      labels.currencyPicker.ukrainianHryvniaLabel,
    );
  },
);
