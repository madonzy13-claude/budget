import { expect, type Page } from "@playwright/test";

/**
 * Plan 09-05 (Wave 0): Page Object for the BDP Wallets-tab Investments section.
 *
 * Selector contract — Plan 09-07 MUST add these test ids to the UI:
 *   data-testid="investments-section"                in investments-section.tsx
 *   data-testid="add-investment-button"              the dashed "+ Add investment" row
 *   data-testid="holding-sheet"                      the add/edit Sheet
 *   data-testid="holding-sheet-name"                 name input (custom holdings)
 *   data-testid="holding-sheet-amount"               amount/value input (cents)
 *   data-testid="holding-sheet-submit"               Sheet save button
 *   data-testid="holding-row-<name>"                 a holding row (read-only)
 *   data-testid="investment-group-<group>"           a collapsible group header
 *
 * Until 09-07 lands these ids the @investments-wallet feature stays @skip-phase-09-debt.
 */
export class InvestmentsPo {
  constructor(private page: Page) {}

  section() {
    return this.page.getByTestId("investments-section");
  }

  addButton() {
    return this.page.getByTestId("add-investment-button");
  }

  sheet() {
    return this.page.getByTestId("holding-sheet");
  }

  row(name: string) {
    return this.page.getByTestId(`holding-row-${name}`);
  }

  groupHeader(group: string) {
    return this.page.getByTestId(`investment-group-${group}`);
  }

  /** Open the Sheet and create a custom holding with a manual value (cents). */
  async addCustomHolding(name: string, amountCents: number): Promise<void> {
    await this.addButton().click();
    await this.sheet().waitFor({ state: "visible" });
    await this.page.getByTestId("holding-sheet-name").fill(name);
    await this.page
      .getByTestId("holding-sheet-amount")
      .fill(String(amountCents));
    await this.page.getByTestId("holding-sheet-submit").click();
  }

  /** Drag a holding row onto a group header (HTML5 DnD). */
  async dragIntoGroup(name: string, group: string): Promise<void> {
    await this.row(name).dragTo(this.groupHeader(group));
  }

  async assertSectionIsLast(): Promise<void> {
    const sections = this.page.locator('[data-testid^="wallet-section-"]');
    await expect(this.section()).toBeVisible();
    // Investments renders after every wallet-type section (INV-02).
    const lastWalletSection = sections.last();
    await expect(lastWalletSection).toBeVisible();
  }
}
