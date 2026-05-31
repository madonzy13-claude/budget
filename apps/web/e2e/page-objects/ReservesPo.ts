import { expect, type Page } from "@playwright/test";

/**
 * Phase 7 Plan 07-10: Page Object for the BDP Reserves tab.
 * Extended with the pending-task PencilLine indicator surfaced by
 * `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx`
 * for any category whose pending RESERVE_TOPUP task is open.
 */
export class ReservesPo {
  constructor(private page: Page) {}

  rowByCategory(name: string) {
    return this.page.getByRole("row", { name: new RegExp(name, "i") }).first();
  }

  /**
   * The PencilLine button rendered by reserves-table-row.tsx carries
   * aria-label = t("reserves.actions.editBalance") = "Edit reserve balance"
   * (English locale). When a row has a pending task, the button is visible
   * inline next to the balance.
   */
  async assertPendingTaskIndicatorVisible(categoryName: string): Promise<void> {
    const row = this.rowByCategory(categoryName);
    await expect(
      row.getByRole("button", { name: /edit reserve balance/i }),
    ).toBeVisible();
  }
}
