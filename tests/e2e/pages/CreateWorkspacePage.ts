import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

export class CreateWorkspacePage {
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

  nameInput(): Locator {
    return this.page.getByLabel(this.labels.workspaces.createNameLabel);
  }

  currencyTrigger(): Locator {
    return this.page.getByRole("combobox").filter({
      hasText: this.labels.currencyPicker.triggerPlaceholder,
    });
  }

  submit(): Locator {
    return this.page.getByRole("button", {
      name: this.labels.workspaces.createCta,
    });
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput().fill(name);
  }

  async pickKind(kind: "PRIVATE" | "SHARED"): Promise<void> {
    await this.page.locator(`input[type="radio"][value="${kind}"]`).check();
  }

  async pickCurrency(label: string): Promise<void> {
    await this.currencyTrigger().click();
    await this.page.getByText(label).first().click();
  }

  async clickSubmit(): Promise<void> {
    await this.submit().click();
  }

  async expectFieldsVisible(): Promise<void> {
    await expect(this.nameInput()).toBeVisible();
    await expect(this.currencyTrigger()).toBeVisible();
    await expect(this.submit()).toBeVisible();
  }
}
