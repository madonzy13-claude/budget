import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the share-link recipient join page (Phase 06/08 E2E).
 *
 * Wraps the join-card, the confirm-join button, and the error state
 * displayed when the link is expired/invalid. This is the recipient-side
 * counterpart to the SettingsPo.shareUrlField() that the budget owner sees.
 *
 * The join page is served at `/invite/[token]`.
 *
 * Actual testids from join-page-card.tsx:
 *   data-testid="join-page-card"   — outer card wrapper (all states)
 *   data-testid="join-error-heading" — heading in error/expired/not-found states
 *   data-testid="join-error-cta"   — CTA button in error/expired states
 *   data-testid="join-budget-name" — budget name shown in valid state
 *
 * The confirm/"Join budget" button in the valid state has no testid; it is
 * located by role="button" + accessible name text (i18n key "authenticated_cta").
 */
export class ShareLinkPo {
  constructor(private page: Page) {}

  /**
   * The join card rendered regardless of token state.
   * testid = "join-page-card"
   */
  joinCard(): Locator {
    return this.page.getByTestId("join-page-card");
  }

  /**
   * The confirm-join / "Join budget" button inside the valid-state join card.
   * The component renders this button only when the user is authenticated and
   * the token is valid. Located by role since the component has no testid on
   * this button.
   */
  joinConfirmButton(): Locator {
    return this.page.getByRole("button", { name: /join|accept/i });
  }

  /**
   * The budget name shown in the valid join card.
   * testid = "join-budget-name"
   */
  joinBudgetName(): Locator {
    return this.page.getByTestId("join-budget-name");
  }

  /**
   * The error heading shown when the link is expired, already used, revoked,
   * or not found. testid = "join-error-heading"
   */
  errorHeading(): Locator {
    return this.page.getByTestId("join-error-heading");
  }

  /**
   * The CTA button/link in the error state (e.g. "Go to home").
   * testid = "join-error-cta"
   */
  errorCta(): Locator {
    return this.page.getByTestId("join-error-cta");
  }

  /**
   * The share URL field in the Settings tab (owner side).
   * testid = "share-url-field"  (share-url-field.tsx)
   */
  shareUrlField(): Locator {
    return this.page.getByTestId("share-url-field");
  }

  /**
   * Navigate to the join page for a given invite token.
   */
  async goto(token: string): Promise<void> {
    await this.page.goto(`/en/budgets/join/${token}`);
    await this.page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
  }
}
