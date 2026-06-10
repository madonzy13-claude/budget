"use client";

import { useEffect } from "react";

/**
 * Keeps the `budget-locale` cookie in sync with the signed-in user's account
 * locale. Middleware reads this cookie to redirect mismatched URL locales —
 * sign-in sets it directly, but this covers sessions that predate that flow.
 */
export function LocaleCookieSync({ accountLocale }: { accountLocale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("budget-locale="))
      ?.split("=")[1];
    if (current !== accountLocale) {
      document.cookie = `budget-locale=${accountLocale}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [accountLocale]);

  return null;
}
