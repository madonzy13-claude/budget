import type { Page } from "@playwright/test";

export class SwitcherPo {
  constructor(private page: Page) {}

  personalSection() {
    return this.page.getByText(/^Personal$|^Osobiste$|^Особисті$/);
  }

  sharedSection() {
    return this.page.getByText(/^Shared$|^Współdzielone$|^Спільні$/);
  }

  budgetRow(name: string) {
    return this.page.getByRole("menuitemradio", { name: new RegExp(name) });
  }
}
