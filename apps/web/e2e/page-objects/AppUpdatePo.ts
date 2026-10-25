import { expect, type Page } from "@playwright/test";

/**
 * AppUpdatePo — the app keeping itself on the latest build, and the Settings
 * version block (user, 261023).
 *
 * The service worker is kept out of these scenarios: requests it handles never
 * reach page.route, and a newer build is faked by answering /version.json.
 * The updater's own logic is the same with or without one.
 */
export class AppUpdatePo {
  private loads = 0;

  constructor(private readonly page: Page) {
    page.on("load", () => this.loads++);
  }

  async withoutServiceWorker(): Promise<void> {
    await this.page.addInitScript(() => {
      if (!navigator.serviceWorker) return;
      navigator.serviceWorker.register = () => new Promise(() => {});
    });
  }

  async serverRunsNewerBuild(): Promise<void> {
    await this.page.route("**/version.json", (route) =>
      route.fulfill({
        json: { buildId: "e2e-newer-build", version: "99.0.0" },
        headers: { "Cache-Control": "no-store" },
      }),
    );
  }

  /** Pretend this page is what an update reload just brought up. */
  async justUpdatedToTheRunningBuild(): Promise<void> {
    const res = await this.page.request.get("/version.json");
    const { buildId } = (await res.json()) as { buildId: string };
    await this.page.addInitScript((target) => {
      if (sessionStorage.getItem("e2e-seeded")) return;
      sessionStorage.setItem("e2e-seeded", "1");
      localStorage.setItem(
        "app-update-attempt",
        JSON.stringify({ target, step: "reload" }),
      );
    }, buildId);
  }

  async openSettings(): Promise<void> {
    await this.page.goto("/en/settings");
  }

  /** Loads seen so far, settled: no new one for `quietMs`. */
  async settledLoads(quietMs = 4000): Promise<number> {
    let seen = -1;
    while (seen !== this.loads) {
      seen = this.loads;
      await this.page.waitForTimeout(quietMs);
    }
    return this.loads;
  }

  get status() {
    return this.page.getByTestId("app-version-status");
  }

  get updateNowButton() {
    return this.page.getByTestId("app-update-now");
  }

  async expectLatest(): Promise<void> {
    await expect(this.page.getByTestId("app-version")).toContainText("Version");
    await expect(this.status).toHaveText("Up to date");
    await expect(this.updateNowButton).toHaveCount(0);
  }

  async expectStale(): Promise<void> {
    await expect(this.status).toHaveText("Update available");
    await expect(this.updateNowButton).toBeVisible();
  }

  async expectUpdatedBanner(): Promise<void> {
    await expect(
      this.page.getByText(/Updated to the newest version/),
    ).toBeVisible();
  }
}
