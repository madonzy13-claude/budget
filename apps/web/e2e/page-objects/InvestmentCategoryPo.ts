import type { Page, Locator } from "@playwright/test";

/**
 * InvestmentCategoryPo — r33 smart Investments category in the spendings grid.
 */
export class InvestmentCategoryPo {
  constructor(private page: Page) {}

  firstColumn(): Locator {
    return this.page.locator('[data-testid^="category-column-"]').first();
  }

  header(): Locator {
    return this.page.getByTestId("column-header-investments");
  }

  overinvestedRow(): Locator {
    return this.page.getByTestId("column-header-investments-overinvested");
  }

  plannedCell(): Locator {
    return this.page.getByTestId("column-header-investments-planned");
  }

  penButton(): Locator {
    return this.page.getByTestId("column-header-pen-investments");
  }

  slider(): Locator {
    return this.page.getByTestId("invest-cat-slider-content");
  }

  smartOption(): Locator {
    return this.page.getByTestId("invest-mode-smart");
  }

  smartHint(): Locator {
    return this.page.getByTestId("invest-smart-hint");
  }

  /** Tapping any summary row reveals the action cluster (pen). */
  async openEditor(): Promise<void> {
    await this.overinvestedRow().click();
    await this.penButton().click();
    await this.slider().waitFor({ state: "visible" });
  }
}
