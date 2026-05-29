import { expect, type Page, type Locator } from "@playwright/test";

export class AppShellPage {
  constructor(private readonly page: Page) {}

  /**
   * "Sign-out button" used to be a bare top-nav icon. After the Profile
   * menu rewrite, the equivalent visible-when-logged-in indicator is
   * the avatar trigger; signing out is a two-click flow (open menu →
   * select "Sign out"). The Locator below keeps the original name so
   * existing scenarios remain readable, but targets the trigger.
   */
  signOutButton(): Locator {
    return this.page.getByTestId("profile-menu-trigger");
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async clickSignOut(): Promise<void> {
    // Open the ProfileMenu, then select Sign out. Sign-out lives inside
    // a Radix DropdownMenu Content; we click the trigger first to mount
    // the Content, then click the menu item. The original race-prevention
    // (waitForResponse on /auth/sign-out + waitForURL on /sign-in +
    // cookie-jar poll) stays — only the click target has changed.
    await this.signOutButton().click();
    const signOutItem = this.page.getByTestId("profile-menu-sign-out");
    await expect(signOutItem).toBeVisible({ timeout: 5000 });
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/auth\/sign-out/.test(res.url()) &&
          res.request().method() === "POST",
        { timeout: 10000 },
      ),
      this.page.waitForURL(/\/(en|pl|uk)\/sign-in(\?|$)/, { timeout: 10000 }),
      signOutItem.click(),
    ]);
    await expect
      .poll(
        async () => {
          const cookies = await this.page.context().cookies();
          return cookies.find((c) => c.name === "better-auth.session_token")
            ?.value;
        },
        { timeout: 5000 },
      )
      .toBeFalsy();
  }

  async expectSignOutButtonVisible(): Promise<void> {
    await expect(this.signOutButton()).toBeVisible();
  }

  async expectSignOutButtonAbsent(): Promise<void> {
    await expect(this.signOutButton()).toHaveCount(0);
  }
}
