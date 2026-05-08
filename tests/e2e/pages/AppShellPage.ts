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
    // SignOutButton fires:  await signOut()  →  router.push('/sign-in')  →  router.refresh()
    //
    // The race: router.push() triggers a client-side URL change (resolving waitForURL)
    // *before* the browser has finished processing the Set-Cookie header from the
    // /api/auth/sign-out response.  In CI (slower network) the cookie removal can lag
    // by tens of ms after the URL lands on /sign-in, so a subsequent page.goto('/workspaces')
    // still sees the session cookie and the middleware does NOT redirect.
    //
    // Fix: wait for BOTH the /auth/sign-out network response (guarantees the browser has
    // received and processed the cookie-clearing Set-Cookie) AND the URL change.
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/auth\/sign-out/.test(res.url()) &&
          res.request().method() === "POST",
        { timeout: 10000 },
      ),
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
