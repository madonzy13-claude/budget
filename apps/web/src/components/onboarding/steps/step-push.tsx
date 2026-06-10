"use client";

/**
 * step-push.tsx — Onboarding step 4: Enable push notifications (skippable)
 * Phase 08-05 Task 3
 */

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";

interface StepPushProps {
  pushEnabled: boolean;
  onChangePush: (v: boolean) => void;
  onSkip: () => void;
}

export function StepPush({ pushEnabled, onChangePush, onSkip }: StepPushProps) {
  const t = useTranslations("onboarding.push");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--body-on-dark)]">
          {t("stepTitle")}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {t("enableDescription")}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-[var(--hairline-on-dark)] bg-[var(--surface-card-dark)] p-4">
        <span className="text-sm font-medium text-[var(--body-on-dark)]">
          {t("enableLabel")}
        </span>
        <Switch
          data-testid="onboarding-push-switch"
          checked={pushEnabled}
          onCheckedChange={onChangePush}
          aria-label={t("enableLabel")}
        />
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
      >
        {t("skip")}
      </button>
    </div>
  );
}
