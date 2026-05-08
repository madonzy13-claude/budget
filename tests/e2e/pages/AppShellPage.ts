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
    // SignOutButton:  await signOut()  →  router.push('/sign-in')  →  router.refresh()
    //
    // Race: router.push() resolves the client-side URL change (and hence
    // waitForURL) before the browser finishes processing Set-Cookie from
    // POST /api/auth/sign-out. In CI a follow-up page.goto('/workspaces')
    // can land BEFORE the cookie is actually cleared, leaving the user
    // appearing authenticated to the middleware → no redirect → test fails.
    //
    // Belt-and-suspenders: (a) wait for the network response, (b) wait for
    // the URL change, then (c) poll the browser's cookie jar until the
    // session cookie is verifiably gone.
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
