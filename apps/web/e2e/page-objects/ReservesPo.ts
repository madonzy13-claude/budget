import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the BDP Reserves tab (Phase 05 reserve rewrite + 05-19 reshape).
 *
 * The reshaped tab renders, per active category, a SINGLE editable "Available"
 * value (no per-row Used cell). The totals footer shows THREE stacked totals —
 * TOTAL AVAILABLE / TOTAL IN WALLETS / TOTAL USED (THIS MONTH) — and NO surplus
 * banner (the RESERVE_TOPUP task card is the reconcile nudge). The old
 * Expected/Actual/Share columns, MismatchChip, per-row Used cell, and
 * SurplusBanner are all gone.
 *
 * Selectors are keyed off the stable data-testids emitted by
 * reserves-table-row.tsx / reserves-totals-footer.tsx:
 *   reserves-row-<categoryId>        — the row wrapper (data-category-id)
 *   reserves-balance-<categoryId>    — the editable Available cell (InlineEditCell)
 *   reserves-active-section          — the active-rows section (holds the headers)
 *   reserves-totals-footer           — the 3-line totals strip
 *   reserves-total-used              — the TOTAL USED value cell in the footer
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

  /** The editable Available cell for a category. */
  async availableCell(name: string): Promise<Locator> {
    const id = await this.categoryIdOf(name);
    return this.page.getByTestId(`reserves-balance-${id}`);
  }

  /** The active-rows "Available" column header (asserts the renamed header). */
  availableColumnHeader(): Locator {
    return this.page
      .getByTestId("reserves-active-section")
      .getByText(/^Available$/);
  }

  /** True when any "Used" column header is present in the active section. */
  async hasUsedColumn(): Promise<boolean> {
    const count = await this.page
      .getByTestId("reserves-active-section")
      .getByText(/^Used$/)
      .count();
    return count > 0;
  }

  /** True when any "Share" column header is present (should be FALSE now). */
  async hasShareColumn(): Promise<boolean> {
    const count = await this.page
      .getByTestId("reserves-active-section")
      .getByText(/^Share$/)
      .count();
    return count > 0;
  }

  /** The totals footer (3 stacked totals). */
  totalsFooter(): Locator {
    return this.page.getByTestId("reserves-totals-footer");
  }

  /** The TOTAL USED (THIS MONTH) value cell. */
  totalUsed(): Locator {
    return this.page.getByTestId("reserves-total-used");
  }

  /** True when the (removed) surplus banner is present (should be FALSE now). */
  async hasSurplusBanner(): Promise<boolean> {
    return (await this.page.getByTestId("reserves-surplus-banner").count()) > 0;
  }

  /** The reserves-disabled notice (reserves_enabled=false). */
  disabledNotice(): Locator {
    return this.page.getByTestId("reserves-disabled-notice");
  }

  /** The acknowledge-only "reserve used to cover overspend" popup. */
  coverDialog(): Locator {
    return this.page.getByTestId("reserve-cover-dialog");
  }

  /** Click the popup's single "Got it" action (the only way to dismiss it). */
  async acknowledgeCover(): Promise<void> {
    await this.page.getByTestId("reserve-cover-ack").click();
  }

  /**
   * Edit a category's Available value: open the inline cell, fill the value,
   * commit with Enter, and wait for the editor to close on the new value.
   * `value` is a bare major-unit decimal string (e.g. "300").
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
}
