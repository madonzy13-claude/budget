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
    await this.signOutButton().click();
  }

  async expectSignOutButtonVisible(): Promise<void> {
    await expect(this.signOutButton()).toBeVisible();
  }

  async expectSignOutButtonAbsent(): Promise<void> {
    await expect(this.signOutButton()).toHaveCount(0);
  }
}
