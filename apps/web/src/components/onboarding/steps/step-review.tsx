"use client";

/**
 * step-review.tsx — Step 4: Read-only review summary.
 *
 * All copy via `onboarding.wizard.review.*`. Boolean feature flags are
 * surfaced as Enabled / Disabled (matching the input semantics on the
 * preceding Features step).
 */
import { useTranslations } from "next-intl";
import { TOP_CURRENCIES } from "@/components/common/currency-picker";

interface StepReviewProps {
  name: string;
  currency: string;
  cushionEnabled: boolean;
  reservesEnabled: boolean;
}

export function StepReview({
  name,
  currency,
  cushionEnabled,
  reservesEnabled,
}: StepReviewProps) {
  const t = useTranslations("onboarding.wizard.review");
  const tc = useTranslations("currency");
  const placeholder = t("placeholder_value");
  // Show the currency as "USD US Dollar $" (code + full name + symbol) to match the
  // rich picker on the Basics step.
  const currencyDisplay = (() => {
    if (!currency) return placeholder;
    const c = TOP_CURRENCIES.find((x) => x.code === currency);
    let name = currency;
    try {
      name = tc(`names.${currency}`);
    } catch {
      name = currency;
    }
    return `${currency} ${name}${c?.symbol ? ` ${c.symbol}` : ""}`;
  })();
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
      <dl
        className="divide-y divide-[var(--hairline-on-dark)] rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-4"
        data-testid="wizard-review-summary"
      >
        <ReviewRow
          label={t("label_name")}
          value={name || placeholder}
          testId="wizard-review-name"
        />
        <ReviewRow
          label={t("label_currency")}
          value={currencyDisplay}
          testId="wizard-review-currency"
        />
        <ReviewRow
          label={t("label_cushion")}
          value={cushionEnabled ? t("value_enabled") : t("value_disabled")}
          testId="wizard-review-cushion"
        />
        <ReviewRow
          label={t("label_reserves")}
          value={reservesEnabled ? t("value_enabled") : t("value_disabled")}
          testId="wizard-review-reserves"
        />
      </dl>
    </div>
  );
}

interface ReviewRowProps {
  label: string;
  value: string;
  testId?: string;
}

function ReviewRow({ label, value, testId }: ReviewRowProps) {
  return (
    <div
      className="flex items-center justify-between py-3"
      data-testid={testId}
    >
      <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-sm font-semibold text-[var(--body-on-dark)]">
        {value}
      </dd>
    </div>
  );
}
