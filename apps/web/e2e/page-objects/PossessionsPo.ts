import { type Page } from "@playwright/test";

/**
 * Page Object for the BDP Wallets-tab Possessions section (always on).
 *
 * Selector contract (possessions-section.tsx / possession-*.tsx):
 *   data-testid="possessions-section"        the section wrapper
 *   data-testid="add-possession-button"      the dashed "+ Add possession" row
 *   data-testid="possession-sheet-name"      name input
 *   data-testid="possession-sheet-amount"    value input (major units)
 *   data-testid="possession-sheet-submit"    Sheet save button
 *   data-testid="possession-row-<name>"      a possession row (read-only)
 */
export class PossessionsPo {
  constructor(private page: Page) {}

  section() {
    return this.page.getByTestId("possessions-section");
  }

  addButton() {
    return this.page.getByTestId("add-possession-button");
  }

  row(name: string) {
    return this.page.getByTestId(`possession-row-${name}`);
  }

  /** Open the sheet and create a possession with a value (major units, e.g.
   *  "25000" = 25,000.00 in the budget currency). Icon left at default. */
  async addPossession(name: string, amount: string): Promise<void> {
    await this.addButton().click();
    const nameInput = this.page.getByTestId("possession-sheet-name");
    await nameInput.waitFor({ state: "visible" });
    await nameInput.fill(name);
    await this.page.getByTestId("possession-sheet-amount").fill(amount);
    // The optimistic save closes the sheet and fires the POST; wait for it to land
    // so a following reload can't cancel the in-flight request (see InvestmentsPo).
    const createPosted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("possession-sheet-submit").click();
    const res = await createPosted;
    if (!res.ok()) {
      throw new Error(
        `create possession POST failed: ${res.status()} ${res.url()}`,
      );
    }
  }
}
