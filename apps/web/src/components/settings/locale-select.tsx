"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
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
      // Account locale is authoritative for logged-in users — persist it to the
      // `budget-locale` cookie so middleware keeps the URL locale in sync.
      document.cookie = `budget-locale=${newLocale}; path=/; max-age=31536000; samesite=lax`;
      // Swap the leading /<locale>/ segment so the page re-renders with the
      // chosen language. Use a FULL navigation (not router.replace+refresh):
      // a same-path locale swap is a different [locale] RSC segment, and on
      // Next 16 the soft replace+refresh raced and left the URL on the old
      // locale (260618). A hard nav re-runs the middleware with the just-set
      // cookie and re-renders ALL messages — reliable + correct for a rare
      // language change.
      const next = pathname.replace(/^\/(en|pl|uk)/, `/${newLocale}`);
      window.location.assign(next || `/${newLocale}`);
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
