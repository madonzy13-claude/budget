import type { Page } from "@playwright/test";

export type BdpTabSlug = "spendings" | "reserves" | "wallets" | "settings";

export class BdpPo {
  constructor(private page: Page) {}

  async goto(locale: string, budgetId: string, tab?: BdpTabSlug) {
    await this.page.goto(
      `/${locale}/budgets/${budgetId}${tab ? `/${tab}` : ""}`,
    );
  }

  pill(slug: BdpTabSlug) {
    return this.page.getByRole("link", { name: new RegExp(slug, "i") }).first();
  }

  pillLabel(slug: BdpTabSlug) {
    return this.pill(slug).locator("span");
  }

  stickyWrapper() {
    return this.page.getByTestId("bdp-sticky-wrapper");
  }
}
