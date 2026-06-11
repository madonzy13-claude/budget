import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the onboarding wizard (Phase 06/08 push opt-in step).
 *
 * Wraps the wizard step navigation, the push notification opt-in toggle,
 * and the skip button. The push step is introduced in Phase 8 (plan 08-05);
 * prior to that plan the `pushStepSwitch` locator will not be found.
 *
 * Testids from wizard components:
 *   data-testid="onboarding-step-title"   — wizard-page.tsx / step heading
 *   data-testid="wizard-stepper"          — wizard-stepper.tsx
 *   data-testid="onboarding-push-switch"  — step-push.tsx
 *
 * Navigation buttons (wizard-layout.tsx) have no testids; located by role/text:
 *   "Next" / "Create budget" / "Finish" — yellow filled button (onNext)
 *   "Skip"                              — ghost button (onSkip), steps 2-4 only
 *   "Back"                              — ghost button (onBack), step > 1
 */
export class OnboardingPo {
  constructor(private page: Page) {}

  /** The visible step title / heading for the current wizard step. */
  stepTitle(): Locator {
    return this.page.getByTestId("onboarding-step-title");
  }

  /** The wizard stepper indicator bar. */
  stepper(): Locator {
    return this.page.getByTestId("wizard-stepper");
  }

  /** The push-notifications enable/disable switch on the push opt-in step. */
  pushStepSwitch(): Locator {
    return this.page.getByTestId("onboarding-push-switch");
  }

  /**
   * The "Skip for now" tertiary button on the push opt-in step (steps 2-4).
   * Located by text since wizard-layout.tsx has no testid on the Skip button.
   */
  skipButton(): Locator {
    // The Push step shows both a footer "Skip" and the step's own "Skip for
    // now" — either advances. .first() avoids a strict-mode ambiguity error.
    return this.page.getByRole("button", { name: /skip/i }).first();
  }

  /**
   * The primary "Next" / "Create budget" / "Finish" button.
   * Located by role; the label changes per step so we match broadly.
   */
  nextButton(): Locator {
    // Step 0 = "Get started", steps 1-4 = "Next", step 5 = "Create budget".
    return this.page.getByRole("button", {
      name: /get started|next|create budget|finish/i,
    });
  }

  /**
   * The "Back" ghost button (visible from step 2 onward).
   */
  backButton(): Locator {
    return this.page.getByRole("button", { name: /back/i });
  }

  /**
   * Navigate to the onboarding wizard.
   */
  async goto(): Promise<void> {
    // /onboarding is a retired route that redirect()s to /budgets/new (the real
    // wizard since Phase 6). Navigate straight to the wizard and wait for the
    // stepper to render rather than networkidle (which the tunnel can race).
    await this.page.goto("/en/budgets/new");
    await this.stepper().waitFor({ state: "visible", timeout: 15000 });
  }

  /**
   * Advance through a wizard step by clicking the Next/primary button.
   */
  async clickNext(): Promise<void> {
    await this.nextButton().click();
  }

  /**
   * Skip the current optional step.
   */
  async clickSkip(): Promise<void> {
    await this.skipButton().click();
  }
}
