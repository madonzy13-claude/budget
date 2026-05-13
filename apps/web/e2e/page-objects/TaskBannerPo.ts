import type { Page } from "@playwright/test";

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
}
