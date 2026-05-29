/**
 * wizard-stepper.tsx — Word-labeled 4-step segmented stepper.
 *
 * Visual states:
 * - completed: subtle primary-tinted bg + primary check + label visible.
 *              Renders as a button — clicking jumps the wizard back to
 *              that step.
 * - current:   filled --primary (#fcd535) + dark label.
 * - upcoming:  outlined --hairline-on-dark + muted label.
 *
 * Step 0 (welcome screen): all four segments render as upcoming — the
 * roadmap is visible but no step is marked active yet.
 *
 * Labels are i18n strings under `onboarding.wizard.stepper.*`; aria
 * descriptions interpolate the localized label so screen readers get
 * the same translation as sighted users.
 */
"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface WizardStepperProps {
  /** 0 = welcome screen (no segment active); 1..4 = real wizard steps. */
  currentStep: 0 | 1 | 2 | 3 | 4;
  onStepJump?: (step: 1 | 2 | 3 | 4) => void;
  className?: string;
}

const STEP_KEYS = ["basics", "type", "features", "review"] as const;

export function WizardStepper({
  currentStep,
  onStepJump,
  className,
}: WizardStepperProps) {
  const t = useTranslations("onboarding.wizard.stepper");
  return (
    <div
      role="list"
      aria-label={t("progress_aria")}
      data-testid="wizard-stepper"
      data-active-step={String(currentStep)}
      className={cn("flex items-center gap-1.5", className)}
    >
      {STEP_KEYS.map((key, idx) => {
        const n = (idx + 1) as 1 | 2 | 3 | 4;
        const label = t(key);
        const isCompleted = n < currentStep;
        const isCurrent = n === currentStep;
        const isUpcoming = n > currentStep;
        const isClickable = isCompleted && !!onStepJump;

        const baseClasses =
          "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-[11px] font-semibold uppercase tracking-wide transition-colors";
        const stateClasses = cn(
          isCompleted &&
            "bg-[color-mix(in_oklab,var(--primary)_14%,transparent)] text-[var(--primary)]",
          isCurrent && "bg-[var(--primary)] text-[#181a20]",
          isUpcoming &&
            "border border-[var(--hairline-on-dark)] bg-transparent text-[var(--muted)]",
          isClickable &&
            "cursor-pointer hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
        );

        const ariaLabel = isCompleted
          ? t("step_completed_aria", { label })
          : isCurrent
            ? t("step_active_aria", { label })
            : t("step_aria", { label });

        const content = (
          <>
            {isCompleted && (
              <Check
                className="h-3 w-3 shrink-0"
                aria-hidden="true"
                strokeWidth={2.75}
              />
            )}
            <span className="truncate">{label}</span>
          </>
        );

        const sharedAttrs = {
          role: "listitem" as const,
          "aria-label": ariaLabel,
          "data-step": String(n),
          "data-completed": isCompleted ? "true" : undefined,
          "data-current": isCurrent ? "true" : undefined,
          "data-upcoming": isUpcoming ? "true" : undefined,
        };

        if (isClickable && onStepJump) {
          return (
            <button
              key={n}
              type="button"
              onClick={() => onStepJump(n)}
              className={cn(baseClasses, stateClasses)}
              {...sharedAttrs}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={n}
            className={cn(baseClasses, stateClasses)}
            {...sharedAttrs}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
