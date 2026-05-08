import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class SettingsPage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/settings`);
  }

  displayCurrencyTab(): Locator {
    return this.page.getByRole("tab", {
      name: this.labels.settings.displayCurrencyTab,
    });
  }

  localeTab(): Locator {
    return this.page.getByRole("tab", { name: this.labels.settings.localeTab });
  }

  async openDisplayCurrencyTab(): Promise<void> {
    await this.displayCurrencyTab().click();
  }

  async openLocaleTab(): Promise<void> {
    await this.localeTab().click();
  }

  displayCurrencyTrigger(): Locator {
    // The CurrencyPicker shared component renders a single combobox inside the
    // tab panel; use the `Display currency` aria-label set by the picker.
    return this.page.getByRole("combobox", {
      name: this.labels.settings.displayCurrencyLabel,
    });
  }

  async openDisplayCurrencyPicker(): Promise<void> {
    await this.displayCurrencyTrigger().click();
  }

  async pickDisplayCurrency(label: string): Promise<void> {
    await this.openDisplayCurrencyPicker();
    // Scope to the cmdk listbox option, otherwise the trigger button's own
    // text (e.g. already-selected "USD · US Dollar") matches first.
    await this.page
      .getByRole("option", { name: new RegExp(label, "i") })
      .click();
  }

  async expectDisplayCurrencyTriggerShows(label: string): Promise<void> {
    await expect(this.displayCurrencyTrigger()).toContainText(label);
  }

  localeTrigger(): Locator {
    return this.page.getByRole("combobox", {
      name: this.labels.settings.localeSelectLabel,
    });
  }

  async openLocalePicker(): Promise<void> {
    await this.localeTrigger().click();
  }

  async pickLocaleOption(label: string): Promise<void> {
    await this.openLocalePicker();
    await this.page
      .getByRole("option", { name: new RegExp(label, "i") })
      .click();
  }
}
