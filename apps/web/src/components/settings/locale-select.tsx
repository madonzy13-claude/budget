"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
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
      // Replace the leading /<locale>/ segment in the URL so the page
      // re-renders with messages for the chosen language.
      const next = pathname.replace(/^\/(en|pl|uk)/, `/${newLocale}`);
      router.replace(next || `/${newLocale}`);
      router.refresh();
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
