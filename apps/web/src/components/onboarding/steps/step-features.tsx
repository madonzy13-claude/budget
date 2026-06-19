"use client";

/**
 * step-features.tsx — Step 3: Optional feature toggles.
 *
 * All copy via `onboarding.wizard.features.*`. Both feature flags
 * default ON in the parent wizard form. Phase 7-09: a months input
 * (cushion_target_months, 1..60) renders below the cushion toggle
 * when cushion is enabled. No new wizard step — the input lives in
 * the same step as the cushion toggle, per D-PH7-34.
 */
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

interface StepFeaturesProps {
  cushionEnabled: boolean;
  onChangeCushion: (v: boolean) => void;
  reservesEnabled: boolean;
  onChangeReserves: (v: boolean) => void;
  /** Phase 7-09: desired cushion runway in months. Default 6. */
  cushionTargetMonths: number;
  onChangeCushionTargetMonths: (v: number) => void;
  /** Push opt-in, folded into Features (260618 UAT). Captured-intent only —
   *  the real subscribe happens in Settings → Notifications. */
  pushEnabled: boolean;
  onChangePush: (v: boolean) => void;
}

interface FeatureRowProps {
  id: string;
  testId: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function FeatureRow({
  id,
  testId,
  label,
  help,
  checked,
  onChange,
}: FeatureRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-[var(--hairline-on-dark)] bg-[var(--surface-elevated-dark)] px-4 py-4">
      <div className="min-w-0 space-y-1">
        <label
          htmlFor={id}
          className="block text-sm font-semibold text-[var(--body-on-dark)]"
        >
          {label}
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">{help}</p>
      </div>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}

export function StepFeatures({
  cushionEnabled,
  onChangeCushion,
  reservesEnabled,
  onChangeReserves,
  cushionTargetMonths,
  onChangeCushionTargetMonths,
  pushEnabled,
  onChangePush,
}: StepFeaturesProps) {
  const t = useTranslations("onboarding.wizard.features");
  const monthsInvalid =
    !Number.isInteger(cushionTargetMonths) ||
    cushionTargetMonths < 1 ||
    cushionTargetMonths > 60;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--body-on-dark)]">
          {t("heading")}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t("subheading")}
        </p>
      </div>

      <div className="space-y-3">
        <FeatureRow
          id="wizard-feat-cushion"
          testId="wizard-feature-cushion"
          label={t("cushion_label")}
          help={t("cushion_help")}
          checked={cushionEnabled}
          onChange={onChangeCushion}
        />
        {cushionEnabled && (
          <div className="flex items-center gap-3 ml-4">
            <label
              htmlFor="onboarding-cushion-target-months"
              className="text-sm text-[var(--body-on-dark)]"
            >
              {t("targetMonthsLabel")}
            </label>
            <Input
              id="onboarding-cushion-target-months"
              type="number"
              min={1}
              max={60}
              step={1}
              value={cushionTargetMonths}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                onChangeCushionTargetMonths(Number.isNaN(v) ? 0 : v);
              }}
              aria-invalid={monthsInvalid ? "true" : undefined}
              className="w-24"
            />
            {monthsInvalid && (
              <span className="text-xs text-[var(--trading-down)]">
                {t("targetMonthsError")}
              </span>
            )}
          </div>
        )}
        <FeatureRow
          id="wizard-feat-reserves"
          testId="wizard-feature-reserves"
          label={t("reserves_label")}
          help={t("reserves_help")}
          checked={reservesEnabled}
          onChange={onChangeReserves}
        />
        <FeatureRow
          id="wizard-feat-push"
          testId="onboarding-push-switch"
          label={t("push_label")}
          help={t("push_help")}
          checked={pushEnabled}
          onChange={onChangePush}
        />
      </div>
    </div>
  );
}
