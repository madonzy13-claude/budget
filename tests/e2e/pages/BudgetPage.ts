import { expect, type Page, type Locator } from "@playwright/test";

export class BudgetPage {
  constructor(private readonly page: Page) {}

  async goto(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/budget`);
  }

  categoryTitle(): Locator {
    return this.page.getByRole("heading", { name: /categories/i });
  }

  categoryNameInList(name: string): Locator {
    return this.page.getByText(name);
  }

  limitEditorFor(categoryName: string): Locator {
    return this.page
      .locator("div")
      .filter({ hasText: categoryName })
      .getByRole("button", { name: /edit/i });
  }

  shareOverrideEditorFor(categoryName: string): Locator {
    return this.page
      .locator("div")
      .filter({ hasText: categoryName })
      .getByRole("button", { name: /shares/i });
  }

  saveButton(): Locator {
    return this.page.getByRole("button", { name: /save/i });
  }

  sumCounter(): Locator {
    return this.page.getByTestId("sum-counter");
  }

  async waitForCategory(name: string): Promise<void> {
    await expect(this.categoryNameInList(name)).toBeVisible({ timeout: 10000 });
  }
}
