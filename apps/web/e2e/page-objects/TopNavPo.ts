import type { Page } from "@playwright/test";

export class TopNavPo {
  constructor(private page: Page) {}

  switcherTrigger() {
    return this.page.getByRole("button", {
      name: /switch budget|przełącz budżet|перемкнути бюджет/i,
    });
  }

  newBudgetButton() {
    return this.page.getByTestId("new-budget-button");
  }

  brandMark() {
    return this.page.getByRole("link", { name: /budget/i }).first();
  }
}
