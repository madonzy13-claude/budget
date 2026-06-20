"use client";

import { useEffect } from "react";

/**
 * Bootstraps the `budget-locale` cookie for signed-in sessions that predate the
 * cookie flow. Middleware reads this cookie to redirect mismatched URL locales.
 *
 * It only writes the cookie when it is ABSENT. It must NOT overwrite a cookie
 * that is already present: both sign-in and the Settings language switch set
 * `budget-locale` directly (and atomically with the DB update), so a present
 * cookie is the user's live, authoritative choice. The `accountLocale` prop is
 * derived from the Better Auth session, which caches `user.locale` and stays
 * STALE within the same session immediately after a Settings change — syncing
 * to it would clobber the just-chosen locale back to the old one and bounce the
 * URL away from the new locale (the language-switch persistence regression).
 */
export function LocaleCookieSync({ accountLocale }: { accountLocale: string }) {
  useEffect(() => {
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("budget-locale="))
      ?.split("=")[1];
    if (!current) {
      document.cookie = `budget-locale=${accountLocale}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [accountLocale]);

  return null;
}
