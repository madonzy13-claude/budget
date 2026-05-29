/**
 * OnboardingPage.ts — Page Object for the 4-step deferred-create wizard.
 *
 * The wizard lives at /[locale]/budgets/new. New users are redirected here
 * by the (app) layout guard when onboarding_progress is incomplete AND no
 * budget exists.
 *
 * Steps:
 *   0 = welcome screen ("Get started" CTA)
 *   1 = Basics    (name + currency)
 *   2 = Type      (personal / shared)
 *   3 = Features  (cushion + reserves toggles)
 *   4 = Review    (Create budget CTA)
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

  /** Stepper bar (4 word-labeled segments). */
  stepper(): Locator {
    return this.page.getByTestId("wizard-stepper");
  }

  /** Active step number (0..4) from data-active-step. */
  async activeStep(): Promise<number> {
    const stepper = this.stepper();
    await stepper.waitFor({ state: "visible", timeout: 10000 });
    const attr = await stepper.getAttribute("data-active-step");
    return attr ? parseInt(attr, 10) : 0;
  }

  // ── Step 0: Welcome ─────────────────────────────────────────────────────────

  getStartedButton(): Locator {
    return this.page.getByRole("button", { name: /^get started$/i });
  }

  // ── Step 1: Basics (name + currency) ────────────────────────────────────────

  nameInput(): Locator {
    return this.page.getByTestId("wizard-step1-name");
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput().fill(name);
  }

  currencyTrigger(): Locator {
    // CurrencyPicker exposes the Radix Select trigger as role=combobox
    // with aria-label "Default currency".
    return this.page.getByRole("combobox", { name: /currency/i });
  }

  async pickCurrency(code: string): Promise<void> {
    await this.currencyTrigger().click();
    const search = this.page.getByPlaceholder(/search currency/i);
    if (await search.isVisible({ timeout: 3000 })) {
      await search.fill(code);
    }
    await this.page
      .getByRole("option", { name: new RegExp(code, "i") })
      .first()
      .click();
  }

  // ── Step 2: Type ────────────────────────────────────────────────────────────

  async pickType(type: "personal" | "shared"): Promise<void> {
    // The radio is sr-only; click the visible label wrapper to activate it.
    await this.page.getByTestId(`wizard-type-${type}`).click();
  }

  // ── Step 3: Features ────────────────────────────────────────────────────────

  cushionSwitch(): Locator {
    return this.page.getByTestId("wizard-feature-cushion");
  }

  reservesSwitch(): Locator {
    return this.page.getByTestId("wizard-feature-reserves");
  }

  async toggleCushion(): Promise<void> {
    await this.cushionSwitch().click();
  }

  async toggleReserves(): Promise<void> {
    await this.reservesSwitch().click();
  }

  // ── Step 4: Review ──────────────────────────────────────────────────────────

  reviewSummary(): Locator {
    return this.page.getByTestId("wizard-review-summary");
  }

  reviewName(): Locator {
    return this.page.getByTestId("wizard-review-name");
  }

  reviewCushion(): Locator {
    return this.page.getByTestId("wizard-review-cushion");
  }

  reviewReserves(): Locator {
    return this.page.getByTestId("wizard-review-reserves");
  }

  // ── Action buttons ──────────────────────────────────────────────────────────

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

  async clickGetStarted(): Promise<void> {
    await this.getStartedButton().click();
  }

  async clickNext(): Promise<void> {
    await this.nextButton().click();
    await this.page.waitForLoadState("networkidle");
  }

  async clickBack(): Promise<void> {
    await this.backButton().click();
  }

  async clickSkip(): Promise<void> {
    await this.skipButton().click();
  }

  async clickCreate(): Promise<void> {
    await this.createButton().click();
    await this.page.waitForLoadState("networkidle");
  }
}
