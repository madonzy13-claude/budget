/**
 * wizard-layout.tsx — Wizard card container
 *
 * Centers the wizard card (max-width 480px), renders the stepper above,
 * step content in the middle, and the action row at the bottom.
 * Action row: Back (ghost/neutral, hidden step 1) | Skip (ghost/neutral, steps 2-4) | Next/Create Budget (yellow)
 */
import { Loader2 } from "lucide-react";
import { WizardStepper } from "./wizard-stepper";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WizardLayoutProps {
  currentStep: 1 | 2 | 3 | 4 | 5;
  children: React.ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  onNext: () => void;
  isLoading?: boolean;
  nextLabel?: string;
  className?: string;
}

export function WizardLayout({
  currentStep,
  children,
  onBack,
  onSkip,
  onNext,
  isLoading = false,
  nextLabel,
  className,
}: WizardLayoutProps) {
  const isLastStep = currentStep === 5;
  const showBack = currentStep > 1;
  const showSkip = currentStep >= 2 && currentStep <= 4;

  const primaryLabel = nextLabel ?? (isLastStep ? "Create budget" : "Next");

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[480px] px-4 py-8 sm:px-0",
        className,
      )}
    >
      {/* Stepper */}
      <WizardStepper currentStep={currentStep} className="mb-8" />

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
              Back
            </Button>
          ) : (
            <div className="flex-1" />
          )}

          {/* Skip — center, steps 2-4 only */}
          {showSkip && (
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              disabled={isLoading}
              className="flex-1 text-[var(--muted)]"
            >
              Skip
            </Button>
          )}

          {/* Spacer to push Next to right when no Skip */}
          {!showSkip && <div className="flex-1" />}

          {/* Next / Create budget — yellow filled, NEVER for Back/Skip */}
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
