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

interface GeneralPillProps {
  initialLocale: string;
  initialDisplayCurrency?: string;
}

export function GeneralPill({
  initialLocale,
  initialDisplayCurrency,
}: GeneralPillProps) {
  const t = useTranslations("settings");

  return (
    <div className="space-y-8">
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
    </div>
  );
}
