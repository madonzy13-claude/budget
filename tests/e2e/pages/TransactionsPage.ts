import { expect, type Page, type Locator } from "@playwright/test";

export class TransactionsPage {
  constructor(private readonly page: Page) {}

  async goto(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/transactions`);
  }

  addTransactionButton(): Locator {
    return this.page.getByTestId("add-transaction-button");
  }

  amountInput(): Locator {
    return this.page.getByTestId("amount-input");
  }

  dateInput(): Locator {
    return this.page.getByTestId("date-input");
  }

  submitButton(): Locator {
    return this.page.getByTestId("submit-button");
  }

  kindTab(kind: "expense" | "income" | "transfer"): Locator {
    return this.page.getByTestId(`kind-tab-${kind}`);
  }

  currencyTrigger(): Locator {
    return this.page.getByLabel(/currency/i).first();
  }

  async clickAddTransaction(): Promise<void> {
    await this.addTransactionButton().click();
  }

  async fillAmount(amount: string): Promise<void> {
    await this.amountInput().fill(amount);
  }

  async fillDate(date: string): Promise<void> {
    await this.dateInput().fill(date);
  }

  async selectKind(kind: "EXPENSE" | "INCOME" | "TRANSFER"): Promise<void> {
    await this.kindTab(kind.toLowerCase() as "expense" | "income" | "transfer").click();
  }

  async pickCurrency(currency: string): Promise<void> {
    await this.currencyTrigger().click();
    await this.page
      .getByRole("option", { name: new RegExp(currency, "i") })
      .first()
      .click();
  }

  async saveTransaction(): Promise<void> {
    await this.submitButton().click();
  }

  transactionRow(amount: string): Locator {
    return this.page.getByTestId(/^transaction-row-/).filter({ hasText: amount });
  }

  async expectTransactionInList(amount: string): Promise<void> {
    await expect(this.transactionRow(amount)).toBeVisible();
  }
}
