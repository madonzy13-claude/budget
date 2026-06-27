"use client";

/**
 * general-pill.tsx — "General" pill of the user-settings carousel (CONTEXT
 * decision 3). Restyles the EXISTING display-language + display-currency controls
 * into the new shell; no backend change. LocaleSelect keeps its full-reload locale
 * swap; DisplayCurrencyPicker keeps its PUT /settings/display-currency mutation.
 */
import { useTranslations } from "next-intl";
import { LocaleSelect } from "@/components/settings/locale-select";
import { DisplayCurrencyPicker } from "@/components/settings/display-currency-picker";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { ThemeToggle } from "@/components/settings/theme-toggle";

interface GeneralPillProps {
  initialLocale: string;
  initialDisplayCurrency?: string;
  initialTimezone?: string;
}

export function GeneralPill({
  initialLocale,
  initialDisplayCurrency,
  initialTimezone,
}: GeneralPillProps) {
  const t = useTranslations("settings");

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-title-md text-[var(--on-dark)]">
          {t("theme.label")}
        </h2>
        <ThemeToggle />
      </section>

      <section className="space-y-3">
        <h2 className="text-title-md text-[var(--on-dark)]">
          {t("locale.label")}
        </h2>
        <LocaleSelect initialLocale={initialLocale} />
      </section>

      <section className="space-y-3">
        <h2 className="text-title-md text-[var(--on-dark)]">
          {t("display_currency.label")}
        </h2>
        {initialDisplayCurrency ? (
          <DisplayCurrencyPicker initialCurrency={initialDisplayCurrency} />
        ) : (
          <DisplayCurrencyPicker />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-title-md text-[var(--on-dark)]">
          {t("timezone.label")}
        </h2>
        <TimezoneSelect initialTimezone={initialTimezone} />
        <p className="text-caption text-[var(--muted-foreground)]">
          {t("timezone.helper")}
        </p>
      </section>
    </div>
  );
}
