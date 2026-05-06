// Single source of truth for supported locales (PLAT-06).
// To add a language: drop a JSON file at messages/{locale}.json
// and add the locale code to this array.
export const locales = ["en", "pl", "uk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
