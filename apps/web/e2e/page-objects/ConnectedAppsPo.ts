import type { Page } from "@playwright/test";

/**
 * Page Object for Settings → Connected apps (Phase 15).
 * Source: components/settings/connected-apps-section.tsx, mounted in the
 * user settings accordion (user-settings-shell.tsx).
 */
export class ConnectedAppsPo {
  constructor(private page: Page) {}

  async open(): Promise<void> {
    await this.page.goto("/en/settings");
    const trigger = this.page.getByRole("button", { name: "Connected apps" });
    await trigger.waitFor({ state: "visible", timeout: 15000 });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  }

  row(clientId: string) {
    return this.page.getByTestId(`connected-app-${clientId}`);
  }

  async disconnect(clientId: string): Promise<void> {
    await this.page.getByTestId(`disconnect-${clientId}`).click();
    await this.page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 10000 });
    await this.page.getByTestId("confirm-action").click();
  }
}
