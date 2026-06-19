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
  // Step 0 = welcome screen (no stepper progress); 1..4 = real wizard steps.
  currentStep: 0 | 1 | 2 | 3 | 4;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  /**
   * Optional handler for jumping back via the stepper pill itself. Wired
   * to the same setStep used by Back. The stepper only fires it for
   * completed segments, so we don't need extra guards in the parent.
   */
  onStepJump?: (step: 1 | 2 | 3 | 4) => void;
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
  const isLastStep = currentStep === 4;
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

        {/* Action row */}
        <div className="flex items-center gap-3">
          {/* Back — left, hidden on step 1 */}
          {showBack ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading}
              className="text-[var(--body-on-dark)] hover:text-[var(--body-on-dark)]"
            >
              {t("back")}
            </Button>
          ) : (
            <div className="flex-1" />
          )}

          {/* Spacer to push Next to the right */}
          <div className="flex-1" />

          {/* Next / Create budget — yellow filled, NEVER for Back */}
          <Button
            type="button"
            onClick={onNext}
            disabled={isLoading}
            className="bg-[var(--primary)] text-[#181a20] hover:bg-[var(--primary-active)] disabled:bg-[var(--primary-disabled)] disabled:text-[var(--muted)]"
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
