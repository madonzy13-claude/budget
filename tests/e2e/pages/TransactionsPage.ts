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

  editSubmitButton(): Locator {
    return this.page.getByTestId("edit-submit-button");
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

  // ── Plan 02-07: Edit + History ─────────────────────────────────────────────

  /**
   * Opens the edit form for a transaction row matching the note/amount text.
   * Right-clicks or finds an edit button on the transaction row.
   */
  async openEditForm(transactionNote: string): Promise<void> {
    // Find the transaction row containing the note text
    const row = this.page.getByTestId(/^transaction-row-/).filter({ hasText: transactionNote });
    // Click the edit button inside the row (rendered in the row via a kebab menu or edit icon)
    const editBtn = row.getByRole("button", { name: /edit/i });
    if (await editBtn.isVisible()) {
      await editBtn.click();
    } else {
      // Fallback: right-click or find the edit sheet trigger
      await row.click();
    }
  }

  /**
   * Changes the amount in the edit form.
   */
  async fillEditAmount(amount: string): Promise<void> {
    await this.amountInput().fill(amount);
  }

  async saveEdit(): Promise<void> {
    await this.editSubmitButton().click();
  }

  /**
   * Returns the "edited" badge locator for a transaction row.
   */
  editedBadge(transactionId?: string): Locator {
    if (transactionId) {
      return this.page.getByTestId(`edited-badge-${transactionId}`);
    }
    return this.page.getByTestId(/^edited-badge-/);
  }

  async clickEditedBadge(transactionId?: string): Promise<void> {
    await this.editedBadge(transactionId).first().click();
  }

  historyPanelRow(index: number): Locator {
    return this.page.getByTestId(`chain-row-${index}`);
  }
}
