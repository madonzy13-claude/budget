import { expect, type Page, type Locator } from "@playwright/test";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

export class BdpTabsPo {
  constructor(private page: Page) {}

  pill(pill: Pill): Locator {
    return this.page.getByRole("link", { name: new RegExp(`^${pill}$`, "i") });
  }

  badge(pill: Pill): Locator {
    return this.pill(pill).getByTestId("pill-badge");
  }

  async assertBadgeCount(pill: Pill, count: number): Promise<void> {
    if (count === 0) {
      await expect(this.badge(pill)).toHaveCount(0);
    } else {
      await expect(this.badge(pill)).toHaveText(String(count));
    }
  }
}
