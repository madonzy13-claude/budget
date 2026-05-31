import { expect, type Page, type Locator } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

/**
 * Page object for the friendly 404 surface. Two render sites share the same
 * selectors:
 *   - apps/web/src/app/[locale]/not-found.tsx        (public, brand header)
 *   - apps/web/src/app/[locale]/(app)/not-found.tsx  (in-shell, inherits TopNav)
 * Both expose `data-testid="not-found-card"` and a Home button at
 * `data-testid="not-found-home-button"`.
 */
export class NotFoundPage {
  // Reserved for locale-specific text assertions in future scenarios.
  private readonly _labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this._labels = LOCALE_LABELS[locale];
  }

  async gotoUnmatched(): Promise<void> {
    // A definitely-unmatched path under the locale segment. Next.js
    // resolves no route, the [locale]/not-found.tsx fallback fires.
    await this.page.goto(`/${this.locale}/does-not-exist-${Date.now()}`);
  }

  card(): Locator {
    return this.page.getByTestId("not-found-card");
  }

  homeButton(): Locator {
    return this.page.getByTestId("not-found-home-button");
  }

  async expectVisible(): Promise<void> {
    await expect(this.card()).toBeVisible({ timeout: 10000 });
    await expect(this.homeButton()).toBeVisible();
  }

  async expectHeading(text: string): Promise<void> {
    await expect(this.card()).toContainText(text);
  }

  async clickHome(): Promise<void> {
    await this.homeButton().click();
  }
}
