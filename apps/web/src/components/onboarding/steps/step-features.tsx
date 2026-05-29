"use client";

/**
 * step-features.tsx — Step 3: Optional feature toggles.
 *
 * All copy via `onboarding.wizard.features.*`. Both feature flags
 * default ON in the parent wizard form.
 */
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";

interface StepFeaturesProps {
  cushionEnabled: boolean;
  onChangeCushion: (v: boolean) => void;
  reservesEnabled: boolean;
  onChangeReserves: (v: boolean) => void;
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
}: StepFeaturesProps) {
  const t = useTranslations("onboarding.wizard.features");
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
        <FeatureRow
          id="wizard-feat-reserves"
          testId="wizard-feature-reserves"
          label={t("reserves_label")}
          help={t("reserves_help")}
          checked={reservesEnabled}
          onChange={onChangeReserves}
        />
      </div>
    </div>
  );
}
