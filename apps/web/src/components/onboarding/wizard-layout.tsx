/**
 * wizard-layout.tsx — Wizard card container
 *
 * Centers the wizard card (max-width 480px), renders the stepper above,
 * step content in the middle, and the action row at the bottom.
 * Action row: Back (ghost/neutral, hidden step 1) | Next/Create Budget (yellow).
 * No Skip — every step advances via Next (Type/Features have defaults; Basics
 * requires a name).
 */
"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { WizardStepper } from "./wizard-stepper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WizardLayoutProps {
  // Step 0 = welcome screen (no stepper progress); 1..3 = real wizard steps.
  currentStep: 0 | 1 | 2 | 3;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  /**
   * Optional handler for jumping back via the stepper pill itself. Wired
   * to the same setStep used by Back. The stepper only fires it for
   * completed segments, so we don't need extra guards in the parent.
   */
  onStepJump?: (step: 1 | 2 | 3) => void;
  isLoading?: boolean;
  nextLabel?: string;
  className?: string;
}

export function WizardLayout({
  currentStep,
  children,
  onBack,
  onNext,
  onStepJump,
  isLoading = false,
  nextLabel,
  className,
}: WizardLayoutProps) {
  const t = useTranslations("onboarding.wizard.actions");
  const isLastStep = currentStep === 3;
  const showBack = currentStep > 1;

  const primaryLabel =
    nextLabel ?? (isLastStep ? t("create_budget") : t("next"));

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[480px] px-4 py-8 sm:px-0",
        className,
      )}
    >
      {/* Stepper — completed pills become jump-back buttons when the
          parent supplies onStepJump. While a network call is in flight
          (isLoading) we disable jump-back to avoid racing in-flight
          writes by passing undefined down. */}
      <WizardStepper
        currentStep={currentStep}
        onStepJump={isLoading ? undefined : onStepJump}
        className="mb-8"
      />

      {/* Card */}
      <div className="rounded-[var(--radius-lg)] bg-[var(--surface-card-dark)] px-8 py-8">
        {/* Step content */}
        <div className="mb-8">{children}</div>

        {/* Action row. Mobile: full-width stacked buttons (primary on top via
            flex-col-reverse, Back below) so a long localized primary label +
            spinner can NEVER overflow the card. sm+: the original row with the
            primary as a right-aligned pill. The old single-row layout let the
            whitespace-nowrap primary (e.g. "Створити бюджет" + spinner) grow past
            the card's right edge on narrow screens. */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          {/* Back — hidden on step 1; full-width on mobile, auto on sm. */}
          {showBack ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading}
              className="w-full sm:w-auto text-[var(--body-on-dark)] hover:text-[var(--body-on-dark)]"
            >
              {t("back")}
            </Button>
          ) : null}

          {/* Spacer pushes the primary right — sm+ only (mobile is stacked). */}
          <div className="hidden sm:block sm:flex-1" />

          {/* Next / Create budget — yellow filled, NEVER for Back. */}
          <Button
            type="button"
            onClick={onNext}
            disabled={isLoading}
            className="w-full sm:w-auto bg-[var(--primary)] text-[#181a20] hover:bg-[var(--primary-active)] disabled:bg-[var(--primary-disabled)] disabled:text-[var(--muted)]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {primaryLabel}
              </>
            ) : (
              primaryLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
