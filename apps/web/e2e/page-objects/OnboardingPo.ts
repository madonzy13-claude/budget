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
    return this.page.getByRole("button", { name: /skip/i });
  }

  /**
   * The primary "Next" / "Create budget" / "Finish" button.
   * Located by role; the label changes per step so we match broadly.
   */
  nextButton(): Locator {
    return this.page.getByRole("button", {
      name: /next|create budget|finish/i,
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
    await this.page.goto("/en/onboarding");
    await this.page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});
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
