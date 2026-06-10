import { expect, type Page, type Locator } from "@playwright/test";

export class AccountsPage {
  constructor(private readonly page: Page) {}

  async goto(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/accounts`);
  }

  addAccountButton(): Locator {
    return this.page.getByRole("button", { name: /add account/i });
  }

  accountNameInput(): Locator {
    return this.page.getByLabel(/account name/i);
  }

  kindSelect(): Locator {
    return this.page.getByLabel(/account kind/i);
  }

  currencyTrigger(): Locator {
    return this.page.getByLabel(/currency/i).first();
  }

  saveButton(): Locator {
    return this.page.getByRole("button", { name: /save account/i });
  }

  cancelButton(): Locator {
    return this.page.getByRole("button", { name: /cancel/i });
  }

  async clickAddAccount(): Promise<void> {
    await this.addAccountButton().click();
  }

  async fillAccountName(name: string): Promise<void> {
    await this.accountNameInput().fill(name);
  }

  async selectKind(kind: string): Promise<void> {
    await this.kindSelect().selectOption(kind);
  }

  async pickCurrency(currency: string): Promise<void> {
    await this.currencyTrigger().click();
    await this.page.getByRole("option", { name: new RegExp(currency, "i") }).first().click();
  }

  async saveAccount(): Promise<void> {
    await this.saveButton().click();
  }

  accountInAssets(name: string): Locator {
    // Find account row under Assets section
    return this.page.locator("section").filter({ hasText: "Assets" }).getByText(name);
  }

  archiveButton(accountName: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(`archive ${accountName}`, "i") });
  }

  accountRow(name: string): Locator {
    return this.page.getByText(name);
  }

  async expectAccountInAssets(name: string): Promise<void> {
    await expect(this.accountInAssets(name)).toBeVisible();
  }

  async archiveAccount(name: string): Promise<void> {
    await this.archiveButton(name).click();
  }
}
