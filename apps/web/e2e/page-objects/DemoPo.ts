import type { Page, Locator } from "@playwright/test";

/**
 * DemoPo — the shared demo account surface (Phase 12).
 *
 * Every wait here is BOUNDED. An unbounded wait in this suite consumes the
 * whole test timeout and any `.catch()` never runs, which turns "the demo is
 * not configured on this stack" into a twenty-minute red instead of a clear
 * skip.
 */
export class DemoPo {
  /** Set by the invite step so the assertion step can read it. */
  lastInviteStatus: number | undefined;

  constructor(private page: Page) {}

  get banner(): Locator {
    return this.page.getByTestId("demo-banner");
  }

  get dialog(): Locator {
    return this.page.getByTestId("demo-welcome-start");
  }

  get budgetCards(): Locator {
    return this.page.getByTestId("budget-card");
  }

  get aggregateTotal(): Locator {
    return this.page.getByTestId("aggregate-capitalization");
  }

  languageButton(label: string): Locator {
    const code = { English: "en", Polski: "pl", Українська: "uk" }[label];
    return this.page.getByTestId(`demo-lang-${code}`);
  }

  async openDemo(path = "/en/demo"): Promise<void> {
    const res = await this.page.goto(path, { waitUntil: "domcontentloaded" });
    if (res && res.status() === 404) {
      throw new Error(
        "The demo is not configured on this stack (/demo returned 404). " +
          "Set DEMO_EMAIL / DEMO_PASSWORD / DEMO_USER_ID and the tenant id " +
          "lists, or run this feature with --grep-invert @demo.",
      );
    }
  }

  async chooseLanguage(label: string): Promise<void> {
    await this.languageButton(label).click({ timeout: 10_000 });
    await this.page.waitForLoadState("domcontentloaded");
  }

  async dismiss(): Promise<void> {
    await this.dialog.click({ timeout: 10_000 });
    await this.dialog.waitFor({ state: "hidden", timeout: 5_000 });
  }

  async openAggregate(): Promise<void> {
    await this.page.goto("/en/budgets/aggregate", {
      waitUntil: "domcontentloaded",
    });
  }

  /**
   * Calls the invite endpoint directly and returns its status. Driving the UI
   * would only prove the button is hidden; the guard is server-side and this
   * asserts the server actually refuses.
   */
  async attemptInvite(): Promise<number> {
    return this.page.evaluate(async () => {
      const id = window.location.pathname.split("/")[3] ?? "unknown";
      const res = await fetch(`/api/budgets/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "someone@example.test" }),
        credentials: "include",
      });
      return res.status;
    });
  }
}
