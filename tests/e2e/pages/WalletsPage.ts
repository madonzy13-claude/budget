import { expect, type Page, type Locator } from "@playwright/test";

export class WalletsPage {
  constructor(private readonly page: Page) {}

  async goto(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/wallets`);
  }

  addWalletButton(): Locator {
    return this.page.getByRole("button", { name: /add wallet/i });
  }

  walletNameInput(): Locator {
    return this.page.getByLabel(/wallet name/i);
  }

  kindSelect(): Locator {
    return this.page.getByLabel(/wallet type|kind/i);
  }

  currencyTrigger(): Locator {
    return this.page.getByLabel(/currency/i).first();
  }

  saveButton(): Locator {
    return this.page.getByRole("button", { name: /save wallet/i });
  }

  cancelButton(): Locator {
    return this.page.getByRole("button", { name: /cancel/i });
  }

  async clickAddWallet(): Promise<void> {
    await this.addWalletButton().click();
  }

  async fillWalletName(name: string): Promise<void> {
    await this.walletNameInput().fill(name);
  }

  async selectKind(kind: string): Promise<void> {
    await this.kindSelect().selectOption(kind);
  }

  async pickCurrency(currency: string): Promise<void> {
    await this.currencyTrigger().click();
    await this.page.getByRole("option", { name: new RegExp(currency, "i") }).first().click();
  }

  async saveWallet(): Promise<void> {
    await this.saveButton().click();
  }

  walletInAssets(name: string): Locator {
    return this.page.locator("section").filter({ hasText: "Assets" }).getByText(name);
  }

  archiveButton(walletName: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(`archive ${walletName}`, "i") });
  }

  walletRow(name: string): Locator {
    return this.page.getByText(name);
  }

  async expectWalletInAssets(name: string): Promise<void> {
    await expect(this.walletInAssets(name)).toBeVisible();
  }

  async archiveWallet(name: string): Promise<void> {
    await this.archiveButton(name).click();
  }
}
