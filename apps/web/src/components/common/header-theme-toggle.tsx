"use client";

/**
 * header-theme-toggle.tsx — compact dark/light icon button for chrome headers.
 *
 * Used on the logged-out auth pages (no account yet) so a visitor can flip the
 * palette. Flips the cookie + <html data-theme> via the shared applyTheme; the
 * pre-paint script in layout.tsx reads that cookie on the next load (no flash).
 * Default follows the cookie, else dark. It does NOT persist to the account —
 * there is no session here (the signed-in surfaces do that via persistTheme).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import {
  applyTheme,
  readTheme,
  type Theme,
} from "@/components/settings/theme-toggle";

export function HeaderThemeToggle() {
  const t = useTranslations("nav");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      data-testid="header-theme-toggle"
      aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
