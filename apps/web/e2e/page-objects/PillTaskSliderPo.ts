import { expect, type Page, type Locator } from "@playwright/test";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

export class PillTaskSliderPo {
  constructor(
    private page: Page,
    private pill: Pill,
  ) {}

  root(): Locator {
    return this.page.locator(
      `[data-testid="pill-task-slider"][data-pill="${this.pill}"]`,
    );
  }

  header(): Locator {
    return this.root().getByRole("button").first();
  }

  rows(): Locator {
    return this.root().getByRole("listitem");
  }

  rowByTitle(title: string | RegExp): Locator {
    return this.rows().filter({ hasText: title });
  }

  actionButton(rowIdx = 0): Locator {
    return this.rows().nth(rowIdx).getByRole("button");
  }

  async expand(): Promise<void> {
    if ((await this.header().getAttribute("aria-expanded")) === "false") {
      await this.header().click();
    }
  }

  async assertExpanded(expanded: boolean): Promise<void> {
    await expect(this.header()).toHaveAttribute(
      "aria-expanded",
      String(expanded),
    );
  }

  async assertRowCount(n: number): Promise<void> {
    await this.expand();
    await expect(this.rows()).toHaveCount(n);
  }

  async assertActionLabel(label: string, rowIdx = 0): Promise<void> {
    await this.expand();
    await expect(this.actionButton(rowIdx)).toHaveText(label);
  }

  async waitForGone(timeoutMs: number): Promise<void> {
    await expect(this.root()).toHaveCount(0, { timeout: timeoutMs });
  }
}
