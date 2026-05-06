"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CurrencyPicker } from "@/components/common/currency-picker";
import { api } from "@/lib/api-client";

interface DisplayCurrencyPickerProps {
  initialCurrency?: string;
}

/**
 * Display currency picker for settings page.
 * On select, fires PUT /api/settings/display-currency mutation (MONY-09).
 * PC-16: asserted in test/display-currency-picker.test.tsx
 * i18n: settings.display_currency.helper, settings.display_currency.label
 */
export function DisplayCurrencyPicker({
  initialCurrency,
}: DisplayCurrencyPickerProps) {
  const t = useTranslations("settings.display_currency");
  const [currency, setCurrency] = useState(initialCurrency ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSelect = async (selected: string) => {
    setCurrency(selected);
    setIsSaving(true);
    try {
      const res = await api.settings["display-currency"].$put({
        json: { currency: selected },
      });
      if (!res.ok) {
        throw new Error("Failed to update display currency");
      }
      toast.success(
        t("save_success", { defaultValue: "Display currency updated." }),
      );
    } catch {
      toast.error("Failed to save display currency. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CurrencyPicker
          value={currency}
          onSelect={handleSelect}
          aria-label={t("label")}
          disabled={isSaving}
        />
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("helper")}</p>
    </div>
  );
}
