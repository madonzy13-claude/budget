import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the onboarding wizard (Phase 08 push opt-in step).
 *
 * Wraps the wizard step navigation, the push notification opt-in toggle,
 * and the skip button. The push step is introduced in Phase 8 (plan 08-04);
 * prior to that plan the `pushStepSwitch` locator will not be found.
 */
export class OnboardingPo {
  constructor(private page: Page) {}

  /** The visible step title / heading for the current wizard step. */
  stepTitle(): Locator {
    return this.page.getByTestId("onboarding-step-title");
  }

  /** The push-notifications enable/disable switch on the push opt-in step. */
  pushStepSwitch(): Locator {
    return this.page.getByTestId("onboarding-push-switch");
  }

  /** The "Skip for now" tertiary button on the push opt-in step. */
  skipButton(): Locator {
    return this.page.getByTestId("onboarding-skip-button");
  }
}
