/**
 * timezones.ts — IANA timezone list + current-offset label for the settings picker.
 *
 * Source is the runtime's own tz database via `Intl.supportedValuesOf("timeZone")`
 * (Chrome 99+/Safari 15.4+/Firefox 100+/Bun/Node 18+). A small curated fallback
 * covers the rare engine that lacks it so the picker is never empty.
 */
const FALLBACK_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Warsaw",
  "Europe/Kyiv",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function listTimezones(): string[] {
  try {
    const sv = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    const zones = sv?.("timeZone");
    if (zones && zones.length) return zones;
  } catch {
    /* fall through */
  }
  return FALLBACK_ZONES;
}

/** Current short UTC offset for a zone, e.g. "GMT+1" (DST-aware, computed now). */
export function tzOffsetLabel(zone: string, locale = "en"): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
