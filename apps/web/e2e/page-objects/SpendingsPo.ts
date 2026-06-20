import { type Page, type Locator, type BrowserContext } from "@playwright/test";

/**
 * Page Object for the BDP Spendings tab (Phase 08 offline/sync features).
 *
 * Exposes locators for the quick-entry form, transaction rows, pending-sync
 * markers, sync-issues list, and the global offline status badge.
 *
 * Selector data-testids are coordinated with the Phase 8 component authoring
 * plans (08-03 offline cache, 08-02 push/sync UI). If a testid is absent in
 * the current build, the locator is returned but will time out on assertion —
 * that is expected until the owning plan ships the component.
 *
 * NOTE on quick-entry testid: the component emits `quick-entry-{categoryName}`
 * (lower-cased), not a single `quick-entry-input`. Use quickEntryInputFor(name)
 * to target the correct category column.
 */
export class SpendingsPo {
  constructor(private page: Page) {}

  /**
   * The quick-entry input for a specific category column.
   * testid = `quick-entry-{categoryName.toLowerCase()}`
   */
  quickEntryInputFor(categoryName: string): Locator {
    return this.page.getByTestId(`quick-entry-${categoryName.toLowerCase()}`);
  }

  /**
   * Convenience: type an amount into a category's quick-entry input and
   * submit with Enter.
   */
  async typeQuickEntry(categoryName: string, amount: string): Promise<void> {
    const input = this.quickEntryInputFor(categoryName);
    await input.click();
    await input.fill(amount);
    await input.press("Enter");
  }

  /**
   * A confirmed transaction row. The component keys the testid off
   * `amountConvertedCents`, e.g. `txn-row-500` for a 5.00 spend.
   * Use txn-row-{amountCents} when the amount is known up-front.
   */
  transactionRowByAmount(amountCents: number): Locator {
    return this.page.getByTestId(`txn-row-${amountCents}`);
  }

  /**
   * The pending-sync marker on a queued (offline) transaction row.
   * testid = `txn-pending-{txn.id}` — the local idempotency key emitted
   * by the write-queue before the server assigns a permanent id.
   * Use a partial testid match when the exact id is unknown.
   */
  pendingSyncMarker(idOrPartial: string): Locator {
    return this.page.getByTestId(`txn-pending-${idOrPartial}`);
  }

  /** Any pending-sync marker (partial match — works before id is known). */
  anyPendingSyncMarker(): Locator {
    return this.page.locator('[data-testid^="txn-pending-"]');
  }

  /** The sync-issues list panel (shown when failed-replay items exist). */
  syncIssuesList(): Locator {
    return this.page.getByTestId("sync-issues-list");
  }

  /** The global offline/queue status badge in the nav. */
  offlineStatusBadge(): Locator {
    return this.page.getByTestId("offline-status-badge");
  }

  /** Simulate going offline by intercepting all network requests. */
  async goOffline(context: BrowserContext): Promise<void> {
    await context.setOffline(true);
  }

  /** Restore network connectivity. */
  async goOnline(context: BrowserContext): Promise<void> {
    await context.setOffline(false);
  }

  /** Draft row for a recurring rule by rule name (lower-cased testid). */
  draftRow(ruleName: string): Locator {
    return this.page.getByTestId(`draft-row-${ruleName.toLowerCase()}`);
  }

  /** The Confirm action button inside a draft row. */
  draftConfirmButton(): Locator {
    return this.page.getByTestId("draft-action-confirm");
  }

  /** The spendings grid wrapper. */
  grid(): Locator {
    return this.page.getByTestId("spendings-grid");
  }

  /** Column header for a category (lower-cased testid). */
  columnHeader(categoryName: string): Locator {
    return this.page.getByTestId(`column-header-${categoryName.toLowerCase()}`);
  }

  /**
   * The reserves-used indicator in a category column header.
   * Visible when a reserve auto-deduct has occurred.
   */
  columnReservesUsed(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-${categoryName.toLowerCase()}-reserves-used`,
    );
  }

  /**
   * The reserves-available indicator in a category column header.
   * Shows the remaining available reserve after auto-deduct.
   */
  columnReservesAvailable(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-${categoryName.toLowerCase()}-reserves-available`,
    );
  }

  // ── Category archive / revert / permanent delete (260611-vuo) ─────────────

  /** Row 1 name cell inside a category column header (click = tap-reveal). */
  columnNameCell(categoryName: string): Locator {
    return this.columnHeader(categoryName).getByTestId(
      "column-header-name-cell",
    );
  }

  /** The truncating name span inside the name cell (exact category name). */
  columnNameSpan(categoryName: string): Locator {
    return this.columnNameCell(categoryName).getByText(categoryName, {
      exact: true,
    });
  }

  /**
   * The lowercase "archived" tag shown on an archived (keep-history) column.
   * EN catalog value: grid.header.archived = "archived".
   */
  columnArchivedLabel(categoryName: string): Locator {
    return this.columnHeader(categoryName).getByText("archived", {
      exact: true,
    });
  }

  /** Edit pen on a normal (non-archived) column header. */
  columnPen(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-pen-${categoryName.toLowerCase()}`,
    );
  }

  /** Revert (unarchive, Undo2) icon on an archived column header. */
  columnRevert(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-revert-${categoryName.toLowerCase()}`,
    );
  }

  /** Permanent-delete trash icon on an archived column header. */
  columnTrash(categoryName: string): Locator {
    return this.page.getByTestId(
      `column-header-trash-${categoryName.toLowerCase()}`,
    );
  }

  /**
   * Row 2 "planned" label cell — a NON-name header row cell. Clicking it
   * toggles the column-wide action reveal (260611-vuo FEATURE3).
   * EN catalog value: grid.header.row2.planned = "planned".
   */
  columnPlannedCell(categoryName: string): Locator {
    return this.columnHeader(categoryName).getByText("planned", {
      exact: true,
    });
  }

  /**
   * The bare planned amount in row 2 (centsToBare format, e.g. 50000 cents
   * → "500"). Exact-match keeps it from colliding with other row values.
   */
  columnPlannedAmount(categoryName: string, bareAmount: string): Locator {
    return this.columnHeader(categoryName).getByText(bareAmount, {
      exact: true,
    });
  }

  /** The category edit slider sheet. */
  catSliderContent(): Locator {
    return this.page.getByTestId("cat-slider-content");
  }

  /** The destructive "Remove" button inside the category edit slider. */
  catSliderDelete(): Locator {
    return this.page.getByTestId("cat-slider-delete");
  }

  /** "Keep history" option in the category remove dialog (archives). */
  catRemoveKeepHistory(): Locator {
    return this.page.getByTestId("cat-remove-keep-history");
  }

  /** Permanent-delete confirm dialog for an archived column's trash. */
  categoryDeleteDialog(): Locator {
    return this.page.getByTestId("category-delete-dialog");
  }

  /** Destructive confirm button inside the permanent-delete dialog. */
  categoryDeleteConfirm(): Locator {
    return this.page.getByTestId("category-delete-confirm");
  }
}
