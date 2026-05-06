"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { locales, localeNames } from "@/lib/locales";
import { api } from "@/lib/api-client";

interface LocaleSelectProps {
  initialLocale: string;
}

export function LocaleSelect({ initialLocale }: LocaleSelectProps) {
  const t = useTranslations("settings");
  const [locale, setLocale] = useState(initialLocale);

  const handleChange = async (newLocale: string) => {
    const previous = locale;
    setLocale(newLocale);
    try {
      const res = await api.settings.locale.$put({
        json: { locale: newLocale },
      });
      if (!res.ok) {
        throw new Error("Failed to update locale");
      }
      toast.success(t("save_success"));
    } catch {
      setLocale(previous);
      toast.error(
        t("error_save", {
          defaultValue: "Failed to save language. Try again.",
        }),
      );
    }
  };

  return (
    <div className="space-y-2">
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger aria-label={t("locale.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {localeNames[loc] ?? loc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
