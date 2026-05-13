import { type Page, type Locator } from "@playwright/test";

export class SpendingsPage {
  constructor(private readonly page: Page) {}

  async goto(locale: string, budgetId: string, month?: string): Promise<void> {
    const url = month
      ? `/${locale}/budgets/${budgetId}/spendings?month=${month}`
      : `/${locale}/budgets/${budgetId}/spendings`;
    await this.page.goto(url);
  }

  gridContainer(): Locator {
    return this.page.getByTestId("spendings-grid");
  }

  quickEntryInput(categoryName: string): Locator {
    return this.page.getByTestId(`quick-entry-${categoryName.toLowerCase()}`);
  }

  columnHeader(categoryName: string): Locator {
    return this.page.getByTestId(`column-header-${categoryName.toLowerCase()}`);
  }

  monthLabel(): Locator {
    return this.page.getByTestId("month-navigator-label");
  }

  monthPrevBtn(): Locator {
    return this.page.getByTestId("month-navigator-prev");
  }

  monthNextBtn(): Locator {
    return this.page.getByTestId("month-navigator-next");
  }

  addCategoryColumn(): Locator {
    return this.page.getByTestId("add-category-column");
  }

  transactionRow(amount: string): Locator {
    return this.page.getByTestId(`txn-row-${amount}`);
  }

  draftRow(ruleName: string): Locator {
    return this.page.getByTestId(`draft-row-${ruleName.toLowerCase()}`);
  }
}
