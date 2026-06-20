import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object for the onboarding wizard.
 *
 * Wraps the wizard step navigation + the push notification opt-in toggle.
 * 260618: push was folded INTO the Features step (no standalone Push step) and
 * the Skip button was removed — every step advances via Next.
 *
 * Testids from wizard components:
 *   data-testid="onboarding-step-title"   — wizard-page.tsx / step heading
 *   data-testid="wizard-stepper"          — wizard-stepper.tsx
 *   data-testid="onboarding-push-switch"  — step-features.tsx (push FeatureRow)
 *
 * Navigation buttons (wizard-layout.tsx) have no testids; located by role/text:
 *   "Next" / "Create budget" — yellow filled button (onNext)
 *   "Back"                   — ghost button (onBack), step > 1
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

  /** The push-notifications enable/disable switch (on the Features step). */
  pushStepSwitch(): Locator {
    return this.page.getByTestId("onboarding-push-switch");
  }

  /**
   * The primary "Next" / "Create budget" button.
   * Located by role; the label changes per step so we match broadly.
   */
  nextButton(): Locator {
    // Step 0 = "Get started", steps 1-3 = "Next", step 4 (Review) = "Create budget".
    return this.page.getByRole("button", {
      name: /get started|next|create budget/i,
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
}
