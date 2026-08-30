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

  /** The demo's two budgets, by the names the refresh job gives them. */
  budgetNamed(name: string): Locator {
    return this.page.getByText(new RegExp(`^${name}$`)).first();
  }

  get aggregateTotal(): Locator {
    return this.page.getByTestId("aggregate-hero");
  }

  languageButton(label: string): Locator {
    const code = { English: "en", Polski: "pl", Українська: "uk" }[label];
    return this.page.getByTestId(`demo-lang-${code}`);
  }

  get entryLink(): Locator {
    return this.page.getByTestId("demo-entry-link");
  }

  get picker(): Locator {
    return this.page.getByTestId("demo-entry-dialog");
  }

  async openSignIn(): Promise<void> {
    // Clear the context first: this suite reuses browser contexts between
    // scenarios, so the page can arrive already signed in as somebody else.
    await this.page.goto("/en/sign-in", { waitUntil: "domcontentloaded" });
    await this.page.context().clearCookies();
    await this.page.evaluate(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* private mode — nothing to clear */
      }
    });
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async openLanguagePicker(): Promise<void> {
    await this.entryLink.click({ timeout: 15_000 });
    await this.picker.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Straight to a language's demo account, skipping the sign-in page. */
  async openDemo(path = "/en/demo"): Promise<void> {
    await this.page.goto("/en/sign-in", { waitUntil: "domcontentloaded" });
    await this.page.context().clearCookies();
    const res = await this.page.goto(path, { waitUntil: "domcontentloaded" });
    if (res && res.status() === 404) {
      throw new Error(
        "The demo is not configured on this stack (/demo returned 404). " +
          "Set DEMO_EMAIL_* / DEMO_PASSWORD_* / DEMO_USER_ID_* and the tenant " +
          "id lists, or run this feature with --grep-invert @demo.",
      );
    }
    await this.banner
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => {});
  }

  async chooseLanguage(label: string): Promise<void> {
    const code = { English: "en", Polski: "pl", Українська: "uk" }[label];
    await this.languageButton(label).click({ timeout: 15_000 });
    // Wait for the sign-in navigation to land, not merely for a load event.
    await this.page
      .waitForURL((u) => new URL(u).pathname.startsWith(`/${code}`), {
        timeout: 30_000,
      })
      .catch(() => {});
  }

  async dismiss(): Promise<void> {
    await this.dialog.click({ timeout: 10_000 });
    await this.dialog.waitFor({ state: "hidden", timeout: 10_000 });
  }

  async openAggregate(): Promise<void> {
    // /demo already lands here; only navigate if a scenario moved away.
    if (!this.page.url().includes("/budgets/aggregate")) {
      await this.page.goto("/en/budgets/aggregate", {
        waitUntil: "domcontentloaded",
      });
    }
  }

  /**
   * Calls the invite endpoint directly and returns its status. Driving the UI
   * would only prove the button is hidden; the guard is server-side and this
   * asserts the server actually refuses.
   */
  async attemptInvite(): Promise<number> {
    // Discover a real budget id from a link in the rendered page. `/api/budgets`
    // is NOT an endpoint (it 404s), and the aggregate route has no budget id in
    // its own path, so neither the URL nor a list call can supply one.
    const href = await this.page
      .locator('a[href*="/budgets/"]')
      .first()
      .getAttribute("href", { timeout: 30_000 })
      .catch(() => null);
    const id = href?.match(
      /\/budgets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1];
    if (!id) return -1; // fails the assertion loudly rather than 404-ing

    // Request context, not page.evaluate: the page may still be navigating.
    const res = await this.page
      .context()
      .request.post(`/api/budgets/${id}/members`, {
        data: { email: "someone@example.test" },
      });
    return res.status();
  }
}
