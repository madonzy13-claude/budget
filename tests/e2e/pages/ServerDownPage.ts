import { expect, type Page, type Locator, type Route } from "@playwright/test";
import { LOCALE_LABELS, type Locale } from "./labels.js";

/**
 * Page object for /[locale]/server-down. The screen is rendered by the
 * (app) layout when getServerSession() throws ServerUnavailableError, and
 * also by the service worker as the offline navigation fallback.
 *
 * Most failure-mode scenarios cannot be reproduced end-to-end from a
 * Playwright test (the bug fires when the api CONTAINER is down — a
 * server-side RSC fetch that the browser cannot intercept). Instead the
 * tests cover the directly-observable surface: page rendering and the
 * client-side Retry button behaviour with the /api/health probe mocked.
 *
 * mockHealthDown / mockHealthUp install browser-level network
 * interceptors on `**​/api/health` so the Retry button can be exercised
 * deterministically.
 */
export class ServerDownPage {
  // Reserved for future locale-specific assertions (label text). The shared
  // helper currently asserts via data-testid so labels aren't needed yet.
  private readonly _labels: (typeof LOCALE_LABELS)[Locale];

  constructor(
    private readonly page: Page,
    private readonly locale: Locale,
  ) {
    this._labels = LOCALE_LABELS[locale];
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.locale}/server-down`);
  }

  card(): Locator {
    return this.page.getByTestId("server-down-card");
  }

  retryButton(): Locator {
    return this.page.getByTestId("server-down-retry-button");
  }

  stillUnreachable(): Locator {
    return this.page.getByTestId("server-down-still-unreachable");
  }

  async expectVisible(): Promise<void> {
    await expect(this.card()).toBeVisible({ timeout: 10000 });
    await expect(this.retryButton()).toBeVisible();
  }

  async expectLocale(locale: Locale): Promise<void> {
    await expect(this.card()).toHaveAttribute("data-locale", locale);
  }

  async clickRetry(): Promise<void> {
    await this.retryButton().click();
  }

  /**
   * Force every browser-side GET /api/health to fail. Use when verifying
   * Retry behaviour while the server is still down — the button should
   * surface the inline "still unreachable" message.
   */
  async mockHealthDown(): Promise<void> {
    await this.page.route("**/api/health", (route: Route) => route.abort());
  }

  /**
   * Force every browser-side GET /api/health to return 200. Use when
   * verifying Retry behaviour after the server comes back — the page
   * should reload to the originally requested route.
   */
  async mockHealthUp(): Promise<void> {
    await this.page.route("**/api/health", (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      }),
    );
  }

  async expectStillUnreachable(): Promise<void> {
    await expect(this.stillUnreachable()).toBeVisible({ timeout: 10000 });
  }
}
