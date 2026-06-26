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

  /** The chevron collapse toggle for a group (carries aria-expanded). */
  groupToggle(group: string) {
    return this.page.getByTestId(`investment-group-toggle-${group}`);
  }

  /** Expand a group if it is collapsed (idempotent). */
  async expandGroup(group: string): Promise<void> {
    const toggle = this.groupToggle(group);
    await toggle.waitFor({ state: "visible" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
  }

  /** Open the Sheet and create a manual ("Other") holding with a value (cents).
   *  Type-first (9.1): pick a manual type so the name + editable amount appear. */
  async addCustomHolding(name: string, amountCents: number): Promise<void> {
    await this.addButton().click();
    await this.sheet().waitFor({ state: "visible" });
    // The Type dropdown auto-opens on create; only tap the trigger to open it if
    // it isn't already showing its options (tapping an open trigger closes it).
    const otherOption = this.page.getByTestId("holding-type-other");
    if (!(await otherOption.isVisible().catch(() => false))) {
      await this.page.getByTestId("holding-sheet-type").click();
    }
    await otherOption.waitFor({ state: "visible" });
    await otherOption.click();
    // Wait for the manual layout (editable amount) to render before filling so
    // the field-fill never races the Type select swap.
    const amount = this.page.getByTestId("holding-sheet-amount");
    await amount.waitFor({ state: "visible" });
    await this.page.getByTestId("holding-sheet-name").fill(name);
    await amount.fill(String(amountCents));
    // The Save handler is fire-and-forget optimistic: it mutate()s and closes the
    // sheet immediately, so the create POST is still in flight when this method
    // returns. A following page.reload() then CANCELS that in-flight POST (a
    // navigation aborts pending fetches) and the holding never persists — a ~50%
    // flake on the persistence guard. Wait for the POST to actually land before
    // returning so reload can't race it.
    const createPosted = this.page.waitForResponse(
      (r) =>
        /\/budgets\/[^/]+\/investments(\?.*)?$/.test(r.url()) &&
        r.request().method() === "POST",
      { timeout: 15000 },
    );
    await this.page.getByTestId("holding-sheet-submit").click();
    const res = await createPosted;
    if (!res.ok()) {
      throw new Error(
        `create holding POST failed: ${res.status()} ${res.url()}`,
      );
    }
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
