import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class WorkspacesPage {
  private readonly labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this.labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/workspaces`);
  }

  emptyCta(): Locator {
    return this.page.getByRole("link", {
      name: this.labels.workspaces.emptyCta,
    });
  }

  async clickEmptyCta(): Promise<void> {
    await this.emptyCta().click();
  }

  async expectEmptyCtaVisible(): Promise<void> {
    await expect(this.emptyCta()).toBeVisible();
  }
}
