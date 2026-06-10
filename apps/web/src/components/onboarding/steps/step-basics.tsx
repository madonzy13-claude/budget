"use client";

/**
 * step-basics.tsx — Step 1: name + default currency in one form.
 *
 * All copy is i18n through `onboarding.wizard.basics.*`.
 */
import { useTranslations } from "next-intl";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { Input } from "@/components/ui/input";

interface StepBasicsProps {
  name: string;
  onChangeName: (v: string) => void;
  nameError?: string;
  currency: string;
  onChangeCurrency: (v: string) => void;
}

export function StepBasics({
  name,
  onChangeName,
  nameError,
  currency,
  onChangeCurrency,
}: StepBasicsProps) {
  const t = useTranslations("onboarding.wizard.basics");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--body-on-dark)]">
          {t("heading")}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t("subheading")}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="wizard-basics-name"
          className="block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
        >
          {t("name_label")}
        </label>
        <Input
          id="wizard-basics-name"
          type="text"
          data-testid="wizard-step1-name"
          placeholder={t("name_placeholder")}
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          maxLength={80}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? "wizard-basics-name-error" : undefined}
          className="bg-[var(--surface-elevated-dark)] border-[var(--hairline-on-dark)] text-[var(--body-on-dark)] placeholder:text-[var(--muted-foreground)]"
        />
        {nameError && (
          <p
            id="wizard-basics-name-error"
            role="alert"
            className="text-sm text-[var(--trading-down)]"
          >
            {nameError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="wizard-basics-currency"
          className="block text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
        >
          {t("currency_label")}
        </label>
        <CurrencyPicker
          value={currency}
          onSelect={onChangeCurrency}
          aria-label={t("currency_label")}
          variant="field"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          {t("currency_helper")}
        </p>
      </div>
    </div>
  );
}
