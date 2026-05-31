import { expect, type Page } from "@playwright/test";

/**
 * Phase 7 Plan 07-10: Page Object for the BDP Wallets tab.
 * Adds helpers for the cushion section anchor / wallet creation flow.
 *
 * Selector contract — relies on:
 *   data-testid="wallet-section-CUSHION"
 *   in apps/web/src/components/budgeting/wallets-tab/wallet-section.tsx
 */
export class WalletsPo {
  constructor(private page: Page) {}

  cushionSection() {
    return this.page.getByTestId("wallet-section-CUSHION");
  }

  /**
   * Phase 7 D-PH7-25: CUSHION_BELOW_TARGET action routes to
   * /budgets/<id>/wallets?task=<id>#cushion. Assert the cushion section
   * is rendered and present in the DOM (we do not assert in-viewport because
   * Playwright `toBeInViewport` is flaky on overflow-y containers across
   * browsers — section visibility is sufficient evidence the anchor worked).
   */
  async assertCushionSectionAnchorVisible(): Promise<void> {
    expect(this.page.url()).toMatch(/#cushion$/);
    await expect(this.cushionSection()).toBeVisible();
  }
}
