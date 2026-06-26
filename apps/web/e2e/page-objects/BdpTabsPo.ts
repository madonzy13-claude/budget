import { expect, type Page, type Locator } from "@playwright/test";

type Pill = "wallets" | "spendings" | "reserves" | "settings";

export class BdpTabsPo {
  constructor(private page: Page) {}

  pill(pill: Pill): Locator {
    // Pills are buttons (client tab switch via pushState), not links. Locate by
    // the STABLE slug testid (`bdp-tab-{slug}`), not the accessible name — the
    // "wallets" pill's visible label/aria is "Assets" (Phase-9 rename), so a
    // name-based regex no longer matches while the slug/route stays "wallets".
    return this.page.getByTestId(`bdp-tab-${pill}`);
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
