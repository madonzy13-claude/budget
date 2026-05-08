import { expect, type Page, type Locator } from "@playwright/test";

export class AppShellPage {
  constructor(private readonly page: Page) {}

  signOutButton(): Locator {
    return this.page.getByTestId("sign-out-button");
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async clickSignOut(): Promise<void> {
    // SignOutButton triggers an async handler (fetch /api/auth/sign-out then
    // router.push to /sign-in). Click() alone resolves before that promise
    // settles, so subsequent steps may race with the in-flight cookie-clearing
    // response. Wait for the post-sign-out redirect to land before returning.
    await Promise.all([
      this.page.waitForURL(/\/(en|pl|uk)\/sign-in(\?|$)/, { timeout: 10000 }),
      this.signOutButton().click(),
    ]);
  }

  async expectSignOutButtonVisible(): Promise<void> {
    await expect(this.signOutButton()).toBeVisible();
  }

  async expectSignOutButtonAbsent(): Promise<void> {
    await expect(this.signOutButton()).toHaveCount(0);
  }
}
