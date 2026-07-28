import { type Page } from "@playwright/test";

/**
 * Page Object for the BDP Wallets-tab Possessions section (always on).
 *
 * Selector contract (possessions-section.tsx / possession-*.tsx):
 *   data-testid="possessions-section"          the section wrapper
 *   data-testid="add-possession-button"        the dashed "+ Add possession" row
 *   data-testid="possession-row-draft"         the staged inline add-row
 *   data-testid="possession-draft-name-input"  the draft name input
 *   data-testid="possession-row-<name>"        an inline-editable possession row
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

  /** Reveal the inline draft add-row, type a name, and commit (Enter → POST). The
   *  value / currency / icon+color are then edited inline on the created row —
   *  same staged-add model as the spendings/reserve/cushion wallet rows. */
  async addPossession(name: string): Promise<void> {
    await this.addButton().click();
    const nameInput = this.page.getByTestId("possession-draft-name-input");
    await nameInput.waitFor({ state: "visible" });
    await nameInput.fill(name);
    // Commit-on-blur fires the create POST; wait for it to land so a following
    // reload can't cancel the in-flight request (see InvestmentsPo).
    const createPosted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await nameInput.press("Enter");
    const res = await createPosted;
    if (!res.ok()) {
      throw new Error(
        `create possession POST failed: ${res.status()} ${res.url()}`,
      );
    }
  }
}
