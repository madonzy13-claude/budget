import { type Page, expect } from "@playwright/test";

export class ProjectionTimelinePo {
  constructor(private page: Page) {}

  banner() {
    return this.page.getByTestId("projection-timeline");
  }

  async expectVisible() {
    await expect(this.banner()).toBeVisible();
  }

  dayCells() {
    return this.page.getByTestId("projection-day");
  }

  async expectAtLeastDays(n: number) {
    const count = await this.dayCells().count();
    expect(count).toBeGreaterThanOrEqual(n);
  }

  async hoverLastDay() {
    const cells = this.dayCells();
    const count = await cells.count();
    await cells.nth(count - 1).hover();
  }

  async expectTooltip() {
    await expect(this.page.getByTestId("projection-tooltip")).toBeVisible();
  }
}
