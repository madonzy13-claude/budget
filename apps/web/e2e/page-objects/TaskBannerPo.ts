import { expect, type Page } from "@playwright/test";

export class TaskBannerPo {
  constructor(private page: Page) {}

  banner() {
    return this.page.getByTestId("task-banner");
  }

  trigger() {
    return this.banner().getByRole("button").first();
  }

  taskRow(idx: number) {
    return this.banner().getByRole("listitem").nth(idx);
  }

  pillLabel() {
    return this.banner().locator("span");
  }

  /**
   * Phase 7: locate a task row by visible title substring. Useful when the
   * banner contains multiple kinds and we want the row whose title contains
   * a substring like "Top up reserve by €50.00" or "Rent".
   */
  rowByTitle(title: string | RegExp) {
    return this.banner().getByRole("listitem").filter({ hasText: title });
  }

  /** Phase 7: the action button inside the first matching task row. */
  rowActionButton(rowIdx = 0) {
    return this.taskRow(rowIdx).getByRole("button");
  }

  /**
   * Phase 7 D-PH7-25: assert the action button text matches the per-kind
   * label from bdp.tasks.action.*.label (e.g., "Fix reserve",
   * "Confirm draft", "Top up cushion").
   */
  async assertActionLabel(label: string, rowIdx = 0): Promise<void> {
    await expect(this.rowActionButton(rowIdx)).toHaveText(label);
  }

  /**
   * Phase 7: wait for the banner to be removed from the DOM after a task
   * auto-resolves (poll cadence is 60s, so we accept up to {timeout} ms).
   */
  async waitForGone(timeoutMs: number): Promise<void> {
    await expect(this.banner()).toHaveCount(0, { timeout: timeoutMs });
  }

  /**
   * Phase 7: assert the expanded list shows N rows. Used by dedup scenario.
   */
  async assertRowCount(n: number): Promise<void> {
    await expect(this.banner().getByRole("listitem")).toHaveCount(n);
  }
}
