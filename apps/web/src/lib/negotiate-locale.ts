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
