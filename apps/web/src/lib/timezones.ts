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

/**
 * Legacy ids browsers still list, mapped to their current IANA name (same
 * zone; Intl accepts both). Kyiv is how Ukraine spells it (user, 261023).
 */
const RENAMED_ZONES: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
};

export function canonicalZone(zone: string): string {
  return RENAMED_ZONES[zone] ?? zone;
}

export function listTimezones(): string[] {
  try {
    const sv = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    const zones = sv?.("timeZone");
    if (zones && zones.length) return zones.map(canonicalZone);
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
