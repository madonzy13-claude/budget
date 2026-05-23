/**
 * OnboardingPage.ts — Phase 6 rewrite for the 5-step onboarding wizard.
 *
 * The wizard lives at /[locale]/budgets/new (not /onboarding — that route
 * is retired and redirects away). New users are redirected here automatically
 * by the (app) layout guard when onboarding_progress is incomplete.
 *
 * Steps: 1=name, 2=currency, 3=type, 4=categories, 5=review.
 */
import { type Page, type Locator } from "@playwright/test";

export class OnboardingPage {
  constructor(private readonly page: Page) {}

  // ── Navigation ──────────────────────────────────────────────────────────────

  async open(locale = "en"): Promise<void> {
    await this.page.goto(`/${locale}/budgets/new`);
    await this.page.waitForLoadState("networkidle");
  }

  // ── Step indicators ─────────────────────────────────────────────────────────

  /** The stepper bar (contains numbered step segments). */
  stepper(): Locator {
    return this.page.getByTestId("wizard-stepper");
  }

  /** Active step number (1-based) read from data-active-step attribute. */
  async activeStep(): Promise<number> {
    const stepper = this.stepper();
    await stepper.waitFor({ state: "visible", timeout: 10000 });
    const attr = await stepper.getAttribute("data-active-step");
    return attr ? parseInt(attr, 10) : 1;
  }

  // ── Step 1: Budget name ─────────────────────────────────────────────────────

  step1NameInput(): Locator {
    return this.page.getByTestId("wizard-step1-name");
  }

  async fillName(name: string): Promise<void> {
    await this.step1NameInput().fill(name);
  }

  // ── Step 2: Currency ────────────────────────────────────────────────────────

  currencyTrigger(): Locator {
    // step-currency renders a shared CurrencyPicker (Radix Select) — its
    // trigger exposes role=combobox with the "Default currency" aria-label.
    return this.page.getByRole("combobox", { name: /currency/i });
  }

  async pickCurrency(code: string): Promise<void> {
    await this.currencyTrigger().click();
    // CurrencyPicker search input
    const search = this.page.getByPlaceholder(/search currency/i);
    if (await search.isVisible({ timeout: 3000 })) {
      await search.fill(code);
    }
    await this.page
      .getByRole("option", { name: new RegExp(code, "i") })
      .first()
      .click();
  }

  // ── Step 3: Budget type ─────────────────────────────────────────────────────

  async pickType(type: "personal" | "shared"): Promise<void> {
    // step-type renders the radio with `className="sr-only"` (visually
    // hidden) — Playwright can't click it. Click the visible label
    // wrapper instead, which natively activates its radio.
    await this.page.getByTestId(`wizard-type-${type}`).click();
  }

  // ── Step 4: Categories ──────────────────────────────────────────────────────

  categoryItem(name: string | RegExp): Locator {
    return this.page
      .getByTestId("wizard-category-item")
      .filter({ hasText: name });
  }

  async toggleCategory(name: string | RegExp): Promise<void> {
    await this.categoryItem(name).click();
  }

  // ── Navigation buttons ──────────────────────────────────────────────────────

  nextButton(): Locator {
    return this.page.getByRole("button", { name: /^next$/i });
  }

  backButton(): Locator {
    return this.page.getByRole("button", { name: /^back$/i });
  }

  skipButton(): Locator {
    return this.page.getByRole("button", { name: /^skip$/i });
  }

  createButton(): Locator {
    return this.page.getByRole("button", { name: /create budget/i });
  }

  async clickNext(): Promise<void> {
    await this.nextButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  async clickBack(): Promise<void> {
    await this.backButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  async clickSkip(): Promise<void> {
    await this.skipButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  async clickCreate(): Promise<void> {
    await this.createButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  // ── Resume banner ───────────────────────────────────────────────────────────

  resumeBanner(): Locator {
    return this.page.getByText(/continue where you left off|welcome back/i);
  }
}
