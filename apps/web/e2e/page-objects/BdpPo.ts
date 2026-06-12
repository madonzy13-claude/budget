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

  /** The pinned [data-shell-header] element (sticky top:0 in browser mode). */
  shellHeader() {
    return this.page.locator("[data-shell-header]");
  }

  /**
   * The tasks banner for a given pill tab.
   * Matches PillTaskSliderPo.root() locator — exposed here for geometry
   * assertions that don't need the full PO.
   */
  tasksBanner(pill: "wallets" | "spendings" | "reserves" | "settings") {
    return this.page.locator(
      `[data-testid="pill-task-slider"][data-pill="${pill}"]`,
    );
  }
}
