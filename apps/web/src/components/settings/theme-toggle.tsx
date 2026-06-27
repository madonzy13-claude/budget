"use client";
/**
 * theme-toggle.tsx — Dark/Light appearance switch for General settings (UAT #9).
 *
 * The theme is a client preference stored in the `budget-theme` cookie and applied
 * to <html data-theme> by the pre-paint script in app/layout.tsx (so it's read on
 * the server-rendered request too → no flash). This control flips the cookie + the
 * live attribute; global.css does the rest.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // 1-year cookie so the server-rendered request paints the right palette.
  document.cookie = `budget-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  // Keep the browser chrome (status bar / address bar) colour in step.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#ffffff" : "#0b0e11");
}

export function ThemeToggle() {
  const t = useTranslations("settings.theme");
  // Default to dark for SSR; sync to the real attribute after mount (avoids a
  // hydration mismatch when the cookie says light).
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current =
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
    setTheme(current);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  const options: { value: Theme; label: string; Icon: typeof Moon }[] = [
    { value: "dark", label: t("dark"), Icon: Moon },
    { value: "light", label: t("light"), Icon: Sun },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      data-testid="theme-toggle"
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-1"
    >
      {options.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`theme-option-${value}`}
            onClick={() => choose(value)}
            className={[
              "flex items-center gap-2 rounded-[var(--radius-sm)] px-4 py-2 text-num-sm transition-colors",
              active
                ? "bg-[var(--primary)] text-[var(--on-primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
