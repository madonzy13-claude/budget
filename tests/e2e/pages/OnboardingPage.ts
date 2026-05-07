import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class OnboardingPage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/onboarding`);
  }

  currencyPickerTrigger(): Locator {
    return this.page
      .getByRole("combobox")
      .filter({ hasText: this.labels.currencyPicker.triggerPlaceholder });
  }

  async openCurrencyPicker(): Promise<void> {
    await this.currencyPickerTrigger().click();
  }

  async expectTopCurrenciesHeader(): Promise<void> {
    await expect(
      this.page.getByText(this.labels.currencyPicker.topCurrenciesHeader),
    ).toBeVisible();
  }

  async expectCurrencyOption(label: string): Promise<void> {
    await expect(this.page.getByText(label)).toBeVisible();
  }

  async expectTriggerVisible(): Promise<void> {
    await expect(this.currencyPickerTrigger()).toBeVisible();
  }
}
