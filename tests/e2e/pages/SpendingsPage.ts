import { type Page, type Locator, expect } from "@playwright/test";

export class SpendingsPage {
  constructor(private readonly page: Page) {}

  async goto(locale: string, budgetId: string, month?: string): Promise<void> {
    const url = month
      ? `/${locale}/budgets/${budgetId}/spendings?month=${month}`
      : `/${locale}/budgets/${budgetId}/spendings`;
    await this.page.goto(url);
    // The BDP carousel (budget-detail.tsx) renders tabs via AnimatePresence: on a
    // tab slide the OUTGOING (exit) and INCOMING (enter) panes briefly coexist in
    // the shared grid cell, so two `spendings-grid` testids exist for the slide
    // duration. Any strict locator (.toBeVisible / .click) then throws
    // "resolved to 2 elements". Wait for the transition to settle to exactly one
    // grid before returning so callers always see a single, live grid.
    await this.waitForGridSettled();
  }

  // ── Grid container ─────────────────────────────────────────────────────────

  /**
   * The live spendings grid. During a carousel slide two grids transiently
   * coexist (exiting + entering pane); AnimatePresence inserts the INCOMING pane
   * AFTER the outgoing one in DOM order, so `.last()` is the active/live pane.
   * Combine with waitForGridSettled() (called from goto) to absorb the transient
   * double rather than rely on .last() alone.
   */
  gridContainer(): Locator {
    return this.page.getByTestId("spendings-grid").last();
  }

  /**
   * Wait for the carousel slide to settle so exactly one `spendings-grid` exists.
   * Absorbs the transient AnimatePresence double-pane (outgoing exit + incoming
   * enter) that makes the strict `getByTestId("spendings-grid")` locator throw
   * "resolved to 2 elements". The incoming pane's grid is asserted visible too.
   */
  async waitForGridSettled(): Promise<void> {
    const grids = this.page.getByTestId("spendings-grid");
    await expect(grids).toHaveCount(1, { timeout: 20000 });
    await expect(grids.first()).toBeVisible({ timeout: 20000 });
  }

  // ── Month navigator ────────────────────────────────────────────────────────

  monthLabel(): Locator {
    return this.page.getByTestId("month-navigator-label");
  }

  monthPrevBtn(): Locator {
    return this.page.getByTestId("month-navigator-prev");
  }

  monthNextBtn(): Locator {
    return this.page.getByTestId("month-navigator-next");
  }

  // ── Column header ──────────────────────────────────────────────────────────

  /**
   * Returns the column header element for a given category name.
   * data-testid="column-header-{name.toLowerCase()}"
   */
  columnHeader(categoryName: string): Locator {
    return this.page.getByTestId(`column-header-${categoryName.toLowerCase()}`);
  }

  /**
   * Returns a specific header row value inside a column header.
   * row: "planned" | "cushion" | "overspent" | "reservesUsed" | "balance"
   */
  columnHeaderRow(categoryName: string, row: string): Locator {
    return this.page.getByTestId(
      `column-header-${categoryName.toLowerCase()}-${row}`,
    );
  }

  /**
   * The drag grip handle inside a column header.
   */
  dragGrip(categoryName: string): Locator {
    return this.page.getByTestId(`drag-grip-${categoryName.toLowerCase()}`);
  }

  // ── Quick-entry ────────────────────────────────────────────────────────────

  quickEntryInput(categoryName: string): Locator {
    return this.page.getByTestId(`quick-entry-${categoryName.toLowerCase()}`);
  }

  /**
   * Retry icon shown on the quick-entry input when the last transaction is unsent.
   */
  quickEntryRetryIcon(categoryName: string): Locator {
    return this.page.getByTestId(
      `quick-entry-retry-${categoryName.toLowerCase()}`,
    );
  }

  // ── Add category column ────────────────────────────────────────────────────

  addCategoryColumn(): Locator {
    return this.page.getByTestId("add-category-column");
  }

  // ── Transaction rows ───────────────────────────────────────────────────────

  /**
   * A transaction row identified by the display amount and category name.
   * data-testid="txn-row-{amount}-{categoryName.toLowerCase()}"
   * Falls back to "txn-row-{amount}" for backward compat.
   */
  transactionRow(amount: string, categoryName?: string): Locator {
    if (categoryName) {
      return this.page.getByTestId(
        `txn-row-${amount}-${categoryName.toLowerCase()}`,
      );
    }
    return this.page.getByTestId(`txn-row-${amount}`);
  }

  // ── Draft rows ─────────────────────────────────────────────────────────────

  draftRow(ruleName: string): Locator {
    return this.page.getByTestId(`draft-row-${ruleName.toLowerCase()}`);
  }

  // ── Revealed actions (single-click reveal) ─────────────────────────────────

  /**
   * The pen (edit) action revealed after single-click on a row.
   */
  revealedActionPen(rowTestId: string): Locator {
    return this.page.getByTestId(`action-pen-${rowTestId}`);
  }

  /**
   * The trash (delete) action revealed after single-click on a row.
   */
  revealedActionTrash(rowTestId: string): Locator {
    return this.page.getByTestId(`action-trash-${rowTestId}`);
  }

  /**
   * The confirm action revealed after single-click on a draft row.
   */
  revealedActionConfirm(draftTestId: string): Locator {
    return this.page.getByTestId(`action-confirm-${draftTestId}`);
  }

  /**
   * The dismiss action revealed after single-click on a draft row.
   */
  revealedActionDismiss(draftTestId: string): Locator {
    return this.page.getByTestId(`action-dismiss-${draftTestId}`);
  }

  // ── Pen action on column header ────────────────────────────────────────────

  /**
   * The pen icon revealed on single-click on a column header.
   */
  columnHeaderPenAction(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-pen-${categoryName.toLowerCase()}`,
    );
  }

  // ── Inline edit ────────────────────────────────────────────────────────────

  /**
   * The inline edit input that appears when double-clicking an amount cell
   * on a transaction row.
   */
  inlineEditInput(rowTestId: string): Locator {
    return this.page.getByTestId(`inline-edit-${rowTestId}`);
  }

  // ── Sliders ────────────────────────────────────────────────────────────────

  /**
   * The transaction slider (Sheet) for creating or editing a transaction.
   */
  transactionSlider(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      hasText: /transaction/i,
    });
  }

  /**
   * The category slider (Sheet) for creating or editing a category.
   */
  categorySlider(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      hasText: /category/i,
    });
  }

  // ── Floating action chips guard ────────────────────────────────────────────

  /**
   * Any floating action chip container visible on the page.
   * Used for negative assertions (no chips visible after hover).
   */
  anyFloatingActionChips(): Locator {
    return this.page.getByTestId(/^action-(pen|trash|confirm|dismiss)-/);
  }
}
