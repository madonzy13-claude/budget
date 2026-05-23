/**
 * wizard-stepper.tsx — Numbered 1-5 segmented stepper (D-07)
 *
 * Visual states:
 * - completed: filled --surface-elevated-dark + lucide Check 12px
 * - current:   filled --primary (#fcd535) + step number in --on-primary
 * - upcoming:  outlined --hairline-on-dark + muted step number
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardStepperProps {
  currentStep: 1 | 2 | 3 | 4 | 5;
  className?: string;
}

export function WizardStepper({ currentStep, className }: WizardStepperProps) {
  const steps = [1, 2, 3, 4, 5] as const;

  return (
    <div
      role="list"
      aria-label="Wizard progress"
      data-testid="wizard-stepper"
      data-active-step={String(currentStep)}
      className={cn("flex items-center gap-2", className)}
    >
      {steps.map((step) => {
        const isCompleted = step < currentStep;
        const isCurrent = step === currentStep;
        const isUpcoming = step > currentStep;

        return (
          <div
            key={step}
            role="listitem"
            aria-label={isCompleted ? `Step ${step} completed` : `Step ${step}`}
            data-step={String(step)}
            data-completed={isCompleted ? "true" : undefined}
            data-current={isCurrent ? "true" : undefined}
            data-upcoming={isUpcoming ? "true" : undefined}
            className={cn(
              "flex h-8 flex-1 items-center justify-center rounded-[var(--radius-sm)] text-xs font-semibold transition-colors",
              isCompleted &&
                "bg-[var(--surface-elevated-dark)] text-[var(--muted)]",
              isCurrent && "bg-[var(--primary)] text-[#181a20]",
              isUpcoming &&
                "border border-[var(--hairline-on-dark)] bg-transparent text-[var(--muted)]",
            )}
          >
            {isCompleted ? (
              <Check
                className="h-3 w-3"
                aria-label={`Step ${step} completed`}
                strokeWidth={2.5}
              />
            ) : (
              <span aria-hidden="true">{step}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
