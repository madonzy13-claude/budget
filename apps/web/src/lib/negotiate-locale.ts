/**
 * negotiate-locale.ts — Accept-Language first-visit locale negotiation.
 *
 * Extracts the preferred locale from an Accept-Language header value.
 * Only recognizes the app's three supported locales: en, pl, uk.
 * Any other value (or absent/malformed header) falls back to "en".
 *
 * Security note (T-08-04-01): the Accept-Language header is untrusted.
 * The value is validated against a fixed allowlist — nothing else is accepted.
 * This function only establishes a first-visit default; it never overrides
 * an authenticated user's account locale (that check lives in middleware.ts).
 */

const SUPPORTED_LOCALES = ["en", "pl", "uk"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Parse the first tag from an Accept-Language header and return the matching
 * supported locale, or "en" as fallback.
 *
 * Examples:
 *   "pl-PL,pl;q=0.9,en;q=0.8" → "pl"
 *   "uk-UA,uk;q=0.9"           → "uk"
 *   "de-DE,de;q=0.9"           → "en"  (not supported)
 *   "" | null | undefined       → "en"
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
): SupportedLocale {
  if (!acceptLanguage) return "en";
  try {
    // Take the first tag (highest priority), strip quality value, take 2-char lang code
    const preferred = acceptLanguage
      .split(",")[0]
      ?.split(";")[0]
      ?.trim()
      ?.slice(0, 2)
      ?.toLowerCase();
    if (
      preferred &&
      (SUPPORTED_LOCALES as readonly string[]).includes(preferred)
    ) {
      return preferred as SupportedLocale;
    }
  } catch {
    // Malformed header — fall through to default
  }
  return "en";
}

function asSupported(value: string | null | undefined): SupportedLocale | null {
  return value && (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? (value as SupportedLocale)
    : null;
}

/**
 * Resolve the SAVED locale for a signed-out visitor from the two locale cookies,
 * applying precedence. The app's own account cookie (budget-locale, set on
 * sign-in / Settings) outranks next-intl's own cookie (NEXT_LOCALE, which
 * next-intl writes on every localized visit). Unsupported values are ignored.
 *
 * Returns the saved locale, or null when neither cookie holds a supported value.
 */
export function resolveSavedLocale(
  budgetLocaleCookie: string | null | undefined,
  nextLocaleCookie: string | null | undefined,
): SupportedLocale | null {
  return asSupported(budgetLocaleCookie) ?? asSupported(nextLocaleCookie);
}

/**
 * Decide where a SIGNED-OUT request with NO URL locale prefix should be
 * redirected, enforcing the precedence:
 *
 *   budget-locale cookie  >  NEXT_LOCALE cookie  >  Accept-Language  >  "en"
 *
 * A saved locale cookie always beats the browser's Accept-Language header
 * (the standard i18n contract — Test 10). Returns:
 *   - "pl" | "uk" | "en" → redirect to that locale prefix, OR
 *   - null               → fall through to next-intl (which emits the canonical
 *                          bare "/" → /en for a header-default first visit, so we
 *                          avoid a redundant extra redirect in that one case).
 *
 * Caller (middleware.ts) must only invoke this when the user is unauthenticated
 * AND the path carries no locale prefix.
 */
export function decideSignedOutLocaleRedirect(args: {
  budgetLocaleCookie?: string | null;
  nextLocaleCookie?: string | null;
  acceptLanguage?: string | null;
}): SupportedLocale | null {
  const saved = resolveSavedLocale(
    args.budgetLocaleCookie,
    args.nextLocaleCookie,
  );
  const target = saved ?? negotiateLocale(args.acceptLanguage);
  // pl/uk always need an explicit redirect (next-intl would otherwise honor a
  // stale/absent cookie or default to en). An explicit saved "en" must also
  // redirect so it beats a non-en Accept-Language header (Case B). Only when
  // there is NO saved cookie and the header negotiates to "en" do we fall
  // through and let next-intl emit the canonical /en (no redundant redirect,
  // no loop).
  if (target !== "en") return target;
  if (saved === "en") return "en";
  return null;
}
