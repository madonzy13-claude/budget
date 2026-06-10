"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { locales } from "@/lib/locales";

/**
 * Locale switcher for public (logged-out) pages — landing, sign-in, sign-up.
 * Logged-out users pick their language here; it simply swaps the URL locale
 * segment. Logged-in users have no switcher in the header — Settings is the
 * only place to change their account locale.
 */
const FLAGS: Record<string, string> = {
  en: "🇬🇧",
  pl: "🇵🇱",
  uk: "🇺🇦",
};

export function PublicLocaleSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(next: string) {
    const target = pathname.replace(/^\/(en|pl|uk)/, `/${next}`) || `/${next}`;
    router.push(target);
    router.refresh();
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Language"
        className="h-9 w-auto gap-1 border-[var(--hairline-dark)] bg-transparent text-[13px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {FLAGS[loc]} {loc.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
