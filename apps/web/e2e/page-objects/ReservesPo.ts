import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the BDP Reserves tab (Phase 05 reserve rewrite — new model).
 *
 * The reshaped tab (05-15) renders, per active category, a SINGLE editable
 * Reserve value + a read-only Used value, plus a budget-level surplus banner
 * (top-up / withdraw / reconciled). The old Expected/Actual/Share columns +
 * MismatchChip are gone.
 *
 * Selectors are keyed off the stable data-testids emitted by
 * reserves-table-row.tsx / reserves-totals-footer.tsx / surplus-banner.tsx:
 *   reserves-row-<categoryId>        — the row wrapper (data-category-id)
 *   reserves-balance-<categoryId>    — the editable Reserve cell (InlineEditCell)
 *   reserves-used-<categoryId>       — the read-only Used cell
 *   reserves-surplus-banner          — the surplus banner (data-direction)
 *   reserves-disabled-notice         — the reserves-disabled notice
 *
 * Categories are addressed by NAME (the row carries the visible name); the PO
 * resolves the row's data-category-id, then targets the id-keyed cells.
 */
export class ReservesPo {
  constructor(private page: Page) {}

  /** Row wrapper for a category by visible name. */
  rowByCategory(name: string): Locator {
    return this.page
      .locator('[data-testid^="reserves-row-"]')
      .filter({ hasText: new RegExp(name, "i") })
      .first();
  }

  /** Resolve the data-category-id of a category row addressed by name. */
  private async categoryIdOf(name: string): Promise<string> {
    const id = await this.rowByCategory(name).getAttribute("data-category-id");
    if (!id) throw new Error(`No reserves row found for category "${name}"`);
    return id;
  }

  /** The editable Reserve cell for a category. */
  async reserveCell(name: string): Promise<Locator> {
    const id = await this.categoryIdOf(name);
    return this.page.getByTestId(`reserves-balance-${id}`);
  }

  /** The read-only Used cell for a category. */
  async usedCell(name: string): Promise<Locator> {
    const id = await this.categoryIdOf(name);
    return this.page.getByTestId(`reserves-used-${id}`);
  }

  /** The budget-level surplus banner (top-up / withdraw / reconciled). */
  surplusBanner(): Locator {
    return this.page.getByTestId("reserves-surplus-banner");
  }

  /** The reserves-disabled notice (reserves_enabled=false). */
  disabledNotice(): Locator {
    return this.page.getByTestId("reserves-disabled-notice");
  }

  /** The active-rows "Used" column header (asserts the new model headers). */
  usedColumnHeader(): Locator {
    return this.page.getByTestId("reserves-active-section").getByText(/^Used$/);
  }

  /** True when any "Share" column header is present (should be FALSE now). */
  async hasShareColumn(): Promise<boolean> {
    const count = await this.page
      .getByTestId("reserves-active-section")
      .getByText(/^Share$/)
      .count();
    return count > 0;
  }

  /**
   * Edit a category's reserve: open the inline cell, clear it, type the value,
   * commit with Enter, and wait for the row to settle on the new value.
   * `value` is a bare major-unit decimal string (e.g. "120").
   */
  async setReserve(name: string, value: string): Promise<void> {
    const id = await this.categoryIdOf(name);
    const cell = this.page.getByTestId(`reserves-balance-${id}`);
    await cell.click();
    const editor = this.page.getByTestId(`reserves-balance-${id}-editor`);
    const input = editor.locator("input");
    await input.waitFor({ state: "visible" });
    await input.fill(value);
    await input.press("Enter");
    // Editor closes once the optimistic write lands; the resting cell shows it.
    await expect(editor).toBeHidden({ timeout: 5000 });
  }

  /** Assert the surplus banner shows the given direction (TOPUP/WITHDRAW/NONE). */
  async assertSurplusDirection(
    direction: "TOPUP" | "WITHDRAW" | "NONE",
  ): Promise<void> {
    await expect(this.surplusBanner()).toHaveAttribute(
      "data-direction",
      direction,
      { timeout: 5000 },
    );
  }
}
