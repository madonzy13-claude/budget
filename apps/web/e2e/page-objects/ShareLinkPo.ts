import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the share-link recipient join page (Phase 08 E2E).
 *
 * Wraps the join-card, the confirm-join button, and the error state
 * displayed when the link is expired/invalid. This is the recipient-side
 * counterpart to the SettingsPo.shareUrlField() that the budget owner sees.
 *
 * The join page is served at `/invite/[token]`.
 */
export class ShareLinkPo {
  constructor(private page: Page) {}

  /**
   * The join card rendered when the invite token is valid and the recipient
   * is authenticated.
   */
  joinCard(): Locator {
    return this.page.getByTestId("share-join-card");
  }

  /** The confirm-join / "Join budget" button inside the join card. */
  joinConfirmButton(): Locator {
    return this.page.getByTestId("share-join-confirm");
  }

  /**
   * The error state shown when the link is expired, already used, or
   * not found — contains the heading and body copy.
   */
  errorState(): Locator {
    return this.page.getByTestId("share-join-error");
  }
}
