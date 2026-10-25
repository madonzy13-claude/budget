import { expect, type Page } from "@playwright/test";

/**
 * InstallPo — the "Install app" banner on Android Chrome.
 *
 * Playwright can't make Chrome decide the app is installable, so the browser's
 * `beforeinstallprompt` is dispatched by hand — the same event the banner
 * listens for.
 */
export class InstallPo {
  constructor(private readonly page: Page) {}

  /** What an earlier install leaves behind: an uninstall keeps site storage. */
  async leftoverInstalledFlag(): Promise<void> {
    await this.page.addInitScript(() => {
      if (sessionStorage.getItem("e2e-install-seeded")) return;
      sessionStorage.setItem("e2e-install-seeded", "1");
      localStorage.setItem("pwa-installed", "1");
    });
  }

  async chromeOffersInstall(): Promise<void> {
    await this.page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(e, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(e);
    });
  }

  async expectBannerOffered(): Promise<void> {
    await expect(this.page.getByTestId("install-banner")).toBeVisible();
    expect(
      await this.page.evaluate(() => localStorage.getItem("pwa-installed")),
    ).toBeNull();
  }
}
