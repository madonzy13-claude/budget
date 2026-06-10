import { type Page, type Locator } from "@playwright/test";

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
 */
export class SpendingsPo {
  constructor(private page: Page) {}

  /** The quick-entry amount/note input for a category row. */
  quickEntryInput(): Locator {
    return this.page.getByTestId("quick-entry-input");
  }

  /** The submit button for the quick-entry form. */
  quickEntrySubmit(): Locator {
    return this.page.getByTestId("quick-entry-submit");
  }

  /** A confirmed transaction row by its server-assigned id. */
  transactionRow(id: string): Locator {
    return this.page.getByTestId(`txn-row-${id}`);
  }

  /** The pending-sync marker on a queued (offline) transaction row. */
  pendingSyncMarker(id: string): Locator {
    return this.page.getByTestId(`txn-pending-${id}`);
  }

  /** The sync-issues list panel (shown when failed-replay items exist). */
  syncIssuesList(): Locator {
    return this.page.getByTestId("sync-issues-list");
  }

  /** The global offline/queue status badge in the nav. */
  offlineStatusBadge(): Locator {
    return this.page.getByTestId("offline-status-badge");
  }
}
